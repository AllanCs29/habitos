import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import "firebase/compat/functions";
import { runtime, actions } from "../core/context.js";
import { firebaseConfig, functionsRegion } from "../firebase-config.js";
import {
  clone,
  migrateState,
  toRecords,
  fromRecords,
  diffRecords,
  withoutSecrets,
  isoDate,
  newId,
  hash,
} from "../core/domain.js";

const LEGACY_KEY = "allan_tcc_master_permanent_store";
let dbPromise,
  scope = "guest",
  baseline = {},
  pending = {},
  cloud = {},
  localQueue = Promise.resolve(),
  syncTimer,
  unsubscribe;
const flushes = new Map();
function openDB() {
  return (dbPromise ||= new Promise((resolve, reject) => {
    const r = indexedDB.open("ControlTCC_Studio_v2", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("accounts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function cacheGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction("accounts").objectStore("accounts").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function cachePut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("accounts", "readwrite");
    t.objectStore("accounts").put(clone(value), key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Guardado cancelado"));
  });
}
function defaults() {
  return actions.createDefaultState();
}
function setStatus(status, error = "") {
  runtime.persistenceStatus = status;
  runtime.syncError = error;
  actions.updateCloudUI?.();
}
function envelope() {
  return {
    state: withoutSecrets(runtime.appState),
    pending,
    cloud,
    savedAt: Date.now(),
  };
}
function persist() {
  const key = scope,
    data = clone(envelope());
  localQueue = localQueue.catch(() => {}).then(() => cachePut(key, data));
  return localQueue.catch((e) => {
    if (scope === key)
      setStatus(
        "error",
        `No se pudo guardar en este dispositivo: ${e.message}`,
      );
    throw e;
  });
}
export async function bootStorage() {
  try {
    await switchLocalScope("guest");
  } catch (e) {
    setStatus("error", e.message);
    actions.showToast(
      "El navegador no permite guardar datos. Exporta un respaldo antes de cerrar.",
      "error",
    );
  }
}
async function switchLocalScope(key) {
  await localQueue.catch(() => {});
  scope = key;
  const cache = await cacheGet(key);
  pending = cache?.pending || {};
  cloud = cache?.cloud || {};
  let raw = cache?.state;
  if (!raw && key === "guest") {
    for (const name of [LEGACY_KEY, "allan_tcc_backup_mirror"]) {
      try {
        const text = localStorage.getItem(name);
        if (text) {
          raw = JSON.parse(text);
          break;
        }
      } catch {}
    }
    if (!raw) raw = await restoreFromIndexedDBVault();
    if (raw) await cachePut("migration-backup", withoutSecrets(raw));
  }
  runtime.appState = migrateState(raw || defaults(), defaults());
  runtime.appState.currentDay = isoDate();
  runtime.appState.days[isoDate()] ||= {
    water: 0,
    meals: [],
    habitsState: {},
    habitValues: {},
    impulses: [],
  };
  baseline = toRecords(runtime.appState);
  setStatus(
    key === "guest"
      ? "local"
      : Object.keys(pending).length
        ? "pending"
        : "loading",
  );
  await persist();
  actions.renderAll();
  actions.checkOnboarding();
}
export function saveState({ undo = true } = {}) {
  runtime.appState.updatedAt = Date.now();
  runtime.appState = migrateState(runtime.appState, defaults());
  const next = toRecords(runtime.appState),
    changes = diffRecords(baseline, next);
  if (undo && Object.keys(changes).length) {
    const inverse = {};
    for (const key of Object.keys(changes))
      inverse[key] = baseline[key] || {
        path: changes[key].path,
        deleted: true,
      };
    runtime.undoStack.push(inverse);
    runtime.undoStack = runtime.undoStack.slice(-15);
  }
  for (const [key, r] of Object.entries(changes))
    pending[key] = { ...r, opId: newId() };
  baseline = next;
  if (runtime.appState.notificationsEnabled && runtime.fbUser)
    actions.scheduleCloudPushViaNtfy?.();
  setStatus(scope === "guest" ? "saving" : "pending");
  const result = persist().then(() => {
    if (scope === "guest") setStatus("local");
    else {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => pushStateToCloud(), 600);
    }
  });
  result.catch(() => {});
  actions.renderAll();
  return result;
}
export function undoLastChange() {
  const inverse = runtime.undoStack.pop();
  if (!inverse) {
    actions.showToast("No hay cambios para deshacer.");
    return;
  }
  const records = { ...toRecords(runtime.appState), ...inverse },
    date = runtime.appState.currentDay;
  runtime.appState = migrateState(fromRecords(records, defaults()), defaults());
  runtime.appState.currentDay = date;
  saveState({ undo: false });
  actions.showToast("Cambio deshecho.", "success");
}
export async function initFirebaseIfConfigured() {
  let config = firebaseConfig;
  try {
    const saved = JSON.parse(
      localStorage.getItem("allan_tcc_firebase_config") || "null",
    );
    if (saved?.projectId && saved?.apiKey) config = saved;
  } catch {}
  runtime.DEFAULT_FIREBASE_CONFIG = config;
  if (!firebase.apps.length) firebase.initializeApp(config);
  runtime.fbAuth = firebase.auth();
  runtime.fbDb = firebase.firestore();
  runtime.fbFunctions = firebase.app().functions(functionsRegion);
  runtime.fbStorage = firebase.storage();
  document.getElementById("firebaseConfigInput").value = JSON.stringify(
    config,
    null,
    2,
  );
  runtime.fbAuth.onAuthStateChanged(async (user) => {
    const epoch = ++runtime.authEpoch;
    actions.cancelAIRequest?.();
    clearTimeout(runtime.reminderTimer);
    actions.closeTaskFormatModal?.();
    actions.closeDemoModal?.();
    actions.closePdfPreviewModal?.();
    actions.cancelManualMealEdit?.();
    runtime.currentModalEvidenceImages = [];
    runtime.currentUploadedImageBase64 = null;
    runtime.currentTutorImageBase64 = null;
    runtime.pendingWorkInboxImageBase64 = null;
    for (const id of [
      "greenApiTokenInput",
      "callMeBotKeyInput",
      "ntfyTokenInput",
      "authPass",
      "obPass",
    ])
      document.getElementById(id).value = "";
    unsubscribe?.();
    unsubscribe = null;
    runtime.fbUser = user;
    runtime.undoStack = [];
    try {
      await switchLocalScope(user ? user.uid : "guest");
      if (epoch !== runtime.authEpoch) return;
      if (user) {
        await pullCloudDataFirst(user.uid);
        if (epoch === runtime.authEpoch) subscribeToUserCloudData(user.uid);
      }
    } catch (e) {
      if (epoch === runtime.authEpoch) {
        setStatus("error", e.message);
        actions.showToast(
          "No se pudo cargar la cuenta. Los datos locales siguen guardados. Reintenta la sincronización.",
          "error",
        );
      }
    }
    actions.updateCloudUI();
  });
  window.addEventListener("online", () => pushStateToCloud());
  window.addEventListener("offline", () => {
    if (runtime.fbUser) setStatus("pending");
  });
}
const collection = (uid) =>
  runtime.fbDb.collection("tcc_users").doc(uid).collection("v2_records");
function docId(key) {
  return btoa(unescape(encodeURIComponent(key)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
async function assetEncode(value, uid) {
  if (
    typeof value === "string" &&
    /^data:image\/(jpeg|png|webp|gif);base64,/.test(value)
  ) {
    const bytes = new TextEncoder().encode(value),
      digest = await crypto.subtle.digest("SHA-256", bytes),
      name = Array.from(new Uint8Array(digest), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
    const path = `users/${uid}/evidence/${name}`;
    const ref = runtime.fbStorage.ref(path);
    await ref.putString(value, "data_url");
    return { $asset: path };
  }
  if (Array.isArray(value))
    return Promise.all(value.map((v) => assetEncode(v, uid)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [
          k,
          await assetEncode(v, uid),
        ]),
      ),
    );
  return value;
}
async function assetDecode(value, uid) {
  if (value && typeof value === "object" && typeof value.$asset === "string") {
    if (!value.$asset.startsWith(`users/${uid}/evidence/`))
      throw new Error("Referencia de imagen no válida para esta cuenta.");
    return runtime.fbStorage.ref(value.$asset).getDownloadURL();
  }
  if (Array.isArray(value))
    return Promise.all(value.map((v) => assetDecode(v, uid)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [
          k,
          await assetDecode(v, uid),
        ]),
      ),
    );
  return value;
}
export async function pullCloudDataFirst(uid) {
  const epoch = runtime.authEpoch;
  const snap = await collection(uid).get();
  if (epoch !== runtime.authEpoch) return;
  if (!snap.empty) {
    await applySnapshot(snap, uid, epoch);
    return;
  }
  const legacy = await runtime.fbDb.collection("tcc_users").doc(uid).get();
  if (epoch !== runtime.authEpoch) return;
  const raw = legacy.exists
    ? legacy.data().stateJson || legacy.data().backupStateJson
    : null;
  if (raw) {
    const old = migrateState(JSON.parse(raw), defaults());
    await cachePut(`migration-backup:${uid}`, withoutSecrets(old));
    runtime.appState = old;
    runtime.appState.currentDay = isoDate();
    baseline = {};
    saveState({ undo: false });
  } else if (!Object.keys(pending).length) {
    baseline = {};
    saveState({ undo: false });
  }
  runtime.isCloudHydrated = true;
  await pushStateToCloud();
}
async function applySnapshot(snapshot, uid, epoch) {
  const received = {};
  for (const doc of snapshot.docs) {
    const r = doc.data();
    if (typeof r.key !== "string") continue;
    received[r.key] = {
      path: r.path,
      order: r.order || 0,
      deleted: r.deleted === true,
      ...(!r.deleted ? { value: await assetDecode(r.value, uid) } : {}),
      opId: r.opId,
    };
  }
  if (epoch !== runtime.authEpoch || scope !== uid) return;
  cloud = received;
  const merged = { ...cloud, ...pending },
    date = runtime.appState.currentDay;
  runtime.appState = migrateState(fromRecords(merged, defaults()), defaults());
  runtime.appState.currentDay = date;
  runtime.appState.days[date] ||= {
    water: 0,
    meals: [],
    habitsState: {},
    habitValues: {},
    impulses: [],
  };
  baseline = toRecords(runtime.appState);
  runtime.isCloudHydrated = true;
  await persist();
  setStatus(Object.keys(pending).length ? "pending" : "synced");
  actions.renderAll();
  actions.checkOnboarding();
}
export function subscribeToUserCloudData(uid) {
  unsubscribe?.();
  const epoch = runtime.authEpoch;
  let queue = Promise.resolve();
  unsubscribe = collection(uid).onSnapshot(
    (snap) => {
      queue = queue
        .catch(() => {})
        .then(() => applySnapshot(snap, uid, epoch))
        .catch((e) => {
          if (epoch === runtime.authEpoch) setStatus("error", e.message);
        });
    },
    (e) => setStatus("error", e.message),
  );
}
export async function pushStateToCloud() {
  const uid = scope,
    epoch = runtime.authEpoch;
  if (!runtime.fbUser || uid === "guest" || runtime.fbUser.uid !== uid)
    return false;
  if (!navigator.onLine) {
    setStatus("pending");
    return false;
  }
  if (flushes.has(uid)) return flushes.get(uid);
  const work = (async () => {
    try {
      while (scope === uid && Object.keys(pending).length) {
        const entries = Object.entries(pending).slice(0, 100),
          batch = runtime.fbDb.batch();
        for (const [key, r] of entries) {
          const encoded = r.deleted ? null : await assetEncode(r.value, uid);
          const data = {
            key,
            path: r.path,
            order: r.order || 0,
            deleted: !!r.deleted,
            opId: r.opId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...(r.deleted ? {} : { value: encoded }),
          };
          if (new TextEncoder().encode(JSON.stringify(data)).length > 800000)
            throw new Error(
              "Un registro es demasiado grande. Divide el contenido antes de sincronizar.",
            );
          batch.set(collection(uid).doc(docId(key)), data);
        }
        await batch.commit();
        if (epoch !== runtime.authEpoch) return false;
        for (const [key, r] of entries) {
          cloud[key] = r;
          if (pending[key]?.opId === r.opId) delete pending[key];
        }
        await persist();
      }
      if (epoch === runtime.authEpoch) setStatus("synced");
      return true;
    } catch (e) {
      if (epoch === runtime.authEpoch) {
        setStatus("error", e.message);
        actions.showToast(
          "Guardado localmente. No se pudo sincronizar: " + e.message,
          "error",
        );
      }
      return false;
    }
  })();
  flushes.set(uid, work);
  try {
    return await work;
  } finally {
    flushes.delete(uid);
  }
}
export async function forceCloudSyncNow() {
  if (!runtime.fbUser) {
    actions.showToast("Inicia sesión para sincronizar.", "warning");
    return;
  }
  if (await pushStateToCloud())
    actions.showToast("Cambios sincronizados.", "success");
}
export async function loginWithFirebase(prefix = "auth") {
  const email = document
      .getElementById(prefix === "ob" ? "obEmail" : "authEmail")
      .value.trim(),
    password = document.getElementById(
      prefix === "ob" ? "obPass" : "authPass",
    ).value;
  if (!email || !password) {
    actions.showToast("Escribe tu correo y contraseña.", "warning");
    return;
  }
  try {
    await runtime.fbAuth.signInWithEmailAndPassword(email, password);
    document.getElementById(prefix === "ob" ? "obPass" : "authPass").value = "";
  } catch (e) {
    actions.showToast(
      "No se pudo iniciar sesión. Revisa tus datos y conexión.",
      "error",
    );
  }
}
export async function registerWithFirebase(prefix = "auth") {
  const email = document
      .getElementById(prefix === "ob" ? "obEmail" : "authEmail")
      .value.trim(),
    password = document.getElementById(
      prefix === "ob" ? "obPass" : "authPass",
    ).value;
  if (!email || password.length < 8) {
    actions.showToast(
      "Usa un correo válido y una contraseña de al menos 8 caracteres.",
      "warning",
    );
    return;
  }
  try {
    await runtime.fbAuth.createUserWithEmailAndPassword(email, password);
    document.getElementById(prefix === "ob" ? "obPass" : "authPass").value = "";
    actions.showToast(
      "Cuenta creada. Puedes importar tus datos locales desde Ajustes.",
      "success",
    );
  } catch (e) {
    actions.showToast("No se pudo crear la cuenta: " + e.code, "error");
  }
}
export async function completeOnboardingWithCloud(mode) {
  if (mode === "register") await registerWithFirebase("ob");
  else await loginWithFirebase("ob");
}
export async function logoutFirebase() {
  await persist().catch(() => {});
  await runtime.fbAuth?.signOut();
  actions.showToast(
    "Sesión cerrada. Tu cuenta y el espacio local están separados.",
  );
}
export async function resetPassword() {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) {
    actions.showToast("Escribe tu correo primero.", "warning");
    return;
  }
  try {
    await runtime.fbAuth.sendPasswordResetEmail(email);
    actions.showToast(
      "Si existe una cuenta con ese correo, recibirás instrucciones.",
      "success",
    );
  } catch {
    actions.showToast(
      "No se pudo solicitar el correo. Reintenta más tarde.",
      "error",
    );
  }
}
export async function saveFirebaseConfig() {
  try {
    const cfg = JSON.parse(
      document.getElementById("firebaseConfigInput").value,
    );
    if (!cfg.projectId || !cfg.apiKey || !cfg.appId)
      throw new Error("Faltan campos de Firebase.");
    await persist();
    localStorage.setItem("allan_tcc_firebase_config", JSON.stringify(cfg));
    location.reload();
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
function downloadJSON(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportBackupJSON() {
  try {
    const state = await portableSnapshot(withoutSecrets(runtime.appState));
    downloadJSON(
      {
        format: "control-tcc-studio",
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        firebaseConfig: runtime.DEFAULT_FIREBASE_CONFIG || firebaseConfig,
        state,
      },
      `control-tcc-${isoDate()}.json`,
    );
  } catch (e) {
    actions.showToast(
      "No se pudo exportar el respaldo completo: " + e.message,
      "error",
    );
  }
}
async function importState(raw) {
  const state = migrateState(raw.state || raw, defaults()),
    counts = `${state.habitsList.length} hábitos, ${state.tasks.length} tareas y ${Object.values(state.days).reduce((n, d) => n + (d.meals?.length || 0), 0)} comidas.`;
  if (
    !(await actions.reviewAIResult(
      "Importar respaldo",
      `${counts}\nSe agregarán los registros del respaldo. Si un registro con el mismo identificador ya existe, se conservará el actual. Las claves privadas no se importan.`,
    ))
  )
    return;
  const date = runtime.appState.currentDay,
    records = { ...toRecords(state), ...toRecords(runtime.appState) };
  runtime.appState = migrateState(fromRecords(records, defaults()), defaults());
  runtime.appState.currentDay = date;
  runtime.appState.onboardingComplete = true;
  await saveState();
  actions.checkOnboarding();
  actions.showToast("Respaldo importado.", "success");
}
export async function importBackupJSON(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 25 * 1024 * 1024)
      throw new Error("El archivo supera 25 MB.");
    const raw = JSON.parse(await file.text());
    if (!(raw.state?.days || raw.days || raw.habitsList))
      throw new Error("No parece un respaldo de Control TCC.");
    await importState(raw);
  } catch (e) {
    actions.showToast(e.message, "error");
  } finally {
    event.target.value = "";
  }
}
export async function importGuestIntoAccount() {
  if (!runtime.fbUser) return;
  const cache = await cacheGet("guest");
  if (cache?.state) await importState(cache.state);
}
export async function restoreFromCloudBackup() {
  try {
    const backup = await cacheGet(`migration-backup:${scope}`);
    if (backup) {
      await importState(backup);
      return;
    }
    const doc = await runtime.fbDb
      .collection("tcc_users")
      .doc(runtime.fbUser.uid)
      .get();
    const raw = doc.data()?.backupStateJson;
    if (raw) await importState(JSON.parse(raw));
    else
      actions.showToast(
        "No hay un respaldo anterior. Puedes importar un archivo JSON.",
      );
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export async function rescueLegacyLocalData() {
  try {
    const backup = await cacheGet("migration-backup");
    const text = localStorage.getItem(LEGACY_KEY);
    const raw =
      backup || (text ? JSON.parse(text) : await restoreFromIndexedDBVault());
    if (raw) await importState(raw);
    else
      actions.showToast(
        "No se encontraron datos anteriores en este navegador.",
      );
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export async function restoreFromIndexedDBVault() {
  return new Promise((resolve) => {
    const req = indexedDB.open("ControlTCC_PermanentVault_DB");
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("state_vault")) {
        db.close();
        resolve(null);
        return;
      }
      const r = db
        .transaction("state_vault")
        .objectStore("state_vault")
        .get("master_state");
      r.onsuccess = () => {
        try {
          resolve(
            typeof r.result === "string"
              ? JSON.parse(r.result)
              : r.result || null,
          );
        } catch {
          resolve(null);
        }
        db.close();
      };
      r.onerror = () => {
        db.close();
        resolve(null);
      };
    };
  });
}
export async function executeFactoryReset() {
  if (
    !(await actions.reviewAIResult(
      "Reiniciar espacio local",
      "Se reiniciará el espacio local de invitado. Las cuentas de Firebase y el respaldo de la migración se conservarán.",
    ))
  )
    return;
  await cachePut("guest", { state: defaults(), pending: {}, cloud: {} });
  if (runtime.fbUser) await logoutFirebase();
  else await switchLocalScope("guest");
  document.getElementById("factoryResetConfirmBox").classList.add("hidden");
  actions.switchTab("today");
}
export async function fbRefGetSafe(ref) {
  return ref.get();
}
export function saveToIndexedDBVault() {
  return persist();
}
export function loadInitialState() {
  return runtime.appState;
}

async function portableSnapshot(value) {
  if (
    typeof value === "string" &&
    value.startsWith("https://firebasestorage.googleapis.com/")
  ) {
    const response = await fetch(value);
    if (!response.ok)
      throw new Error("Falta una imagen. Revisa la conexión y sus permisos.");
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  if (Array.isArray(value)) return Promise.all(value.map(portableSnapshot));
  if (value && typeof value === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [
          k,
          await portableSnapshot(v),
        ]),
      ),
    );
  return value;
}
