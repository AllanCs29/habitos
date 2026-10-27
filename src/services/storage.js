import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/storage";
import "firebase/compat/functions";
import { runtime, actions } from "../core/context.js";
import { firebaseConfig, functionsRegion } from "../firebase-config.js";
import {
  readLegacyDocument,
  recoveryCounts,
  recoveryRecords,
} from "../core/recovery.js";
import {
  clone,
  migrateState,
  toRecords,
  fromRecords,
  diffRecords,
  withoutSecrets,
  isoDate,
  newId,
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
const hydrations = new Map();
const activeAccount = (uid, epoch) =>
  scope === uid && runtime.fbUser?.uid === uid && runtime.authEpoch === epoch;
const permissionsError = (error) =>
  String(error?.code || "").includes("permission-denied");
function cloudErrorMessage(error) {
  if (permissionsError(error))
    return "Firebase no permite leer o guardar la nueva estructura. Publica las reglas de firestore.rules en tu proyecto y pulsa Sincronizar ahora. Tus cambios siguen guardados en este dispositivo.";
  return (
    "No se pudo completar la sincronización. Tus cambios siguen guardados en este dispositivo. Revisa la conexión y pulsa Sincronizar ahora. " +
    (error?.message || "")
  );
}
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
  if (
    scope !== "guest" &&
    runtime.cloudMode === "legacy" &&
    status !== "loading"
  )
    status = "migration";
  runtime.persistenceStatus = status;
  runtime.syncError = error || runtime.cloudIssue || "";
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
async function switchLocalScope(key, epoch = runtime.authEpoch) {
  await localQueue.catch(() => {});
  if (epoch !== runtime.authEpoch) return false;
  const cache = await cacheGet(key);
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
  if (epoch !== runtime.authEpoch) return false;
  scope = key;
  pending = cache?.pending || {};
  cloud = cache?.cloud || {};
  runtime.cloudMode = "unknown";
  runtime.cloudIssue = "";
  runtime.isCloudHydrated = false;
  runtime.legacyRecoveryAvailable = false;
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
  return true;
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
  runtime.fbAuth.onAuthStateChanged(handleAuthStateChanged);
  window.addEventListener("online", () => synchronizeAccount());
  window.addEventListener("offline", () => {
    if (runtime.fbUser) setStatus("pending");
  });
}
export async function handleAuthStateChanged(user) {
  const epoch = ++runtime.authEpoch;
  runtime.isCloudHydrated = false;
  runtime.cloudMode = "unknown";
  runtime.cloudIssue = "";
  clearTimeout(syncTimer);
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
    await switchLocalScope(user ? user.uid : "guest", epoch);
    if (epoch !== runtime.authEpoch) return;
    if (user) {
      await pullCloudDataFirst(user.uid);
      if (activeAccount(user.uid, epoch) && runtime.isCloudHydrated)
        subscribeToUserCloudData(user.uid);
    }
  } catch (e) {
    if (epoch === runtime.authEpoch) {
      runtime.cloudIssue = cloudErrorMessage(e);
      setStatus("error", runtime.cloudIssue);
      actions.showToast(
        "No se pudo cargar la cuenta. Los datos locales siguen guardados. Reintenta la sincronización.",
        "error",
      );
    }
  }
  actions.updateCloudUI();
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
  if (!activeAccount(uid, epoch)) return false;
  const key = `${uid}:${epoch}`;
  if (hydrations.has(key)) return hydrations.get(key);
  const work = hydrateAccount(uid, epoch);
  hydrations.set(key, work);
  try {
    return await work;
  } finally {
    hydrations.delete(key);
  }
}
async function hydrateAccount(uid, epoch) {
  if (!navigator.onLine) {
    setStatus(
      "pending",
      "Sin conexión. Se conservan tus registros en este dispositivo.",
    );
    return false;
  }
  runtime.isCloudHydrated = false;
  setStatus("loading");
  let legacy = null,
    legacyError;
  // Read the original document independently of the new subcollection's permissions.
  try {
    const doc = await runtime.fbDb
      .collection("tcc_users")
      .doc(uid)
      .get({ source: "server" });
    if (!activeAccount(uid, epoch)) return false;
    legacy = readLegacyDocument(doc.exists ? doc.data() : null, defaults());
    if (legacy) {
      if (!(await cacheGet(`migration-backup:${uid}`)))
        await cachePut(`migration-backup:${uid}`, withoutSecrets(legacy.state));
    }
  } catch (e) {
    legacyError = e;
  }
  if (!activeAccount(uid, epoch)) return false;
  try {
    // An offline/cache-only empty result is not evidence of an empty cloud account.
    const snapshot = await collection(uid).get({ source: "server" });
    if (!activeAccount(uid, epoch)) return false;
    if (snapshot.empty && legacyError) throw legacyError;
    runtime.cloudMode = "records";
    runtime.cloudIssue = "";
    if (!snapshot.empty) {
      await applySnapshot(snapshot, uid, epoch);
      if (!activeAccount(uid, epoch)) return false;
      if (legacy) {
        const original = toRecords(legacy.state),
          known = { ...cloud, ...pending };
        runtime.legacyRecoveryAvailable = Object.entries(original).some(
          ([key, r]) =>
            !(key in known) &&
            r.path.length > 1 &&
            !["meta", "water"].includes(r.path.at(-1)),
        );
      }
    } else {
      const records = {
        ...toRecords(legacy?.state || runtime.appState),
        ...pending,
      };
      renderRecords(records);
      cloud = {};
      for (const [key, record] of Object.entries(records))
        pending[key] ||= { ...record, opId: newId() };
      runtime.isCloudHydrated = true;
      await persist();
    }
    if (!activeAccount(uid, epoch)) return false;
    return await pushStateToCloud();
  } catch (error) {
    if (!activeAccount(uid, epoch)) return false;
    runtime.isCloudHydrated = false;
    // Display readable history even while v2 permissions still need deployment.
    // Keep a known v2 cache authoritative so old records cannot revive deletions.
    if (legacy && !Object.keys(cloud).length) {
      renderRecords({ ...toRecords(legacy.state), ...pending });
      runtime.cloudMode = "legacy";
      await persist();
    }
    if (!activeAccount(uid, epoch)) return false;
    runtime.cloudIssue = cloudErrorMessage(error);
    setStatus("error", runtime.cloudIssue);
    return false;
  }
}
function renderRecords(records) {
  const date = runtime.appState.currentDay;
  runtime.appState = migrateState(fromRecords(records, defaults()), defaults());
  runtime.appState.currentDay = date;
  runtime.appState.days[date] ||= {
    water: 0,
    meals: [],
    habitsState: {},
    habitValues: {},
    impulses: [],
  };
  baseline = toRecords(runtime.appState);
  actions.renderAll();
  actions.checkOnboarding();
}
async function applySnapshot(snapshot, uid, epoch) {
  if (!activeAccount(uid, epoch)) return;
  if (snapshot.empty && snapshot.metadata?.fromCache) {
    setStatus(
      "pending",
      "Esperando una lectura del servidor. Se conserva el historial de este dispositivo.",
    );
    return;
  }
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
  renderRecords({ ...cloud, ...pending });
  runtime.isCloudHydrated = true;
  await persist();
  if (!activeAccount(uid, epoch)) return;
  setStatus(
    Object.keys(pending).length ||
      snapshot.metadata?.fromCache ||
      snapshot.metadata?.hasPendingWrites
      ? "pending"
      : "synced",
  );
  actions.renderAll();
  actions.checkOnboarding();
}
export function subscribeToUserCloudData(uid) {
  unsubscribe?.();
  const epoch = runtime.authEpoch;
  let queue = Promise.resolve();
  unsubscribe = collection(uid).onSnapshot(
    { includeMetadataChanges: true },
    (snap) => {
      queue = queue
        .catch(() => {})
        .then(() => applySnapshot(snap, uid, epoch))
        .catch((e) => {
          if (epoch === runtime.authEpoch) setStatus("error", e.message);
        });
    },
    (e) => {
      if (activeAccount(uid, epoch)) {
        runtime.isCloudHydrated = false;
        runtime.cloudIssue = cloudErrorMessage(e);
        setStatus("error", runtime.cloudIssue);
      }
    },
  );
}
export async function pushStateToCloud() {
  const uid = scope,
    epoch = runtime.authEpoch;
  if (!runtime.fbUser || uid === "guest" || runtime.fbUser.uid !== uid)
    return false;
  if (!runtime.isCloudHydrated) return false;
  if (!navigator.onLine) {
    setStatus("pending");
    return false;
  }
  if (flushes.has(uid)) return flushes.get(uid);
  const work = (async () => {
    try {
      while (activeAccount(uid, epoch) && Object.keys(pending).length) {
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
        if (!activeAccount(uid, epoch)) return false;
        await batch.commit();
        if (!activeAccount(uid, epoch)) return false;
        for (const [key, r] of entries) {
          cloud[key] = r;
          if (pending[key]?.opId === r.opId) delete pending[key];
        }
        await persist();
      }
      if (!activeAccount(uid, epoch)) return false;
      runtime.cloudIssue = "";
      setStatus("synced");
      return true;
    } catch (e) {
      if (epoch === runtime.authEpoch) {
        runtime.cloudIssue = cloudErrorMessage(e);
        setStatus("error", runtime.cloudIssue);
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
  if (await synchronizeAccount())
    actions.showToast("Cambios sincronizados.", "success");
}
async function synchronizeAccount() {
  const uid = runtime.fbUser?.uid,
    epoch = runtime.authEpoch;
  if (!uid) return false;
  unsubscribe?.();
  unsubscribe = null;
  try {
    const synced = await pullCloudDataFirst(uid);
    if (activeAccount(uid, epoch) && runtime.isCloudHydrated)
      subscribeToUserCloudData(uid);
    return synced;
  } catch (error) {
    if (activeAccount(uid, epoch)) setStatus("error", cloudErrorMessage(error));
    return false;
  }
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
  const epoch = runtime.authEpoch,
    target = scope;
  const state = migrateState(raw.state || raw, defaults()),
    counts = recoveryCounts(state);
  if (
    !(await actions.reviewAIResult(
      "Importar respaldo",
      `${counts}.\nSe agregarán los registros que faltan y se completarán los campos vacíos del perfil. Se conservan los registros actuales y los borrados de esta versión. Las claves privadas no se importan.`,
    ))
  )
    return;
  if (epoch !== runtime.authEpoch || target !== scope) return;
  const date = runtime.appState.currentDay,
    records = recoveryRecords(state, runtime.appState, {
      ...cloud,
      ...pending,
    });
  runtime.appState = migrateState(fromRecords(records, defaults()), defaults());
  runtime.appState.currentDay = date;
  runtime.appState.onboardingComplete = true;
  runtime.legacyRecoveryAvailable = false;
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
  if (!runtime.fbUser) {
    actions.showToast(
      "Inicia sesión con tu cuenta anterior para recuperar su historial.",
      "warning",
    );
    return;
  }
  const uid = runtime.fbUser.uid,
    epoch = runtime.authEpoch;
  try {
    let state, readError;
    try {
      const doc = await runtime.fbDb
        .collection("tcc_users")
        .doc(uid)
        .get({ source: "server" });
      state = readLegacyDocument(
        doc.exists ? doc.data() : null,
        defaults(),
      )?.state;
    } catch (e) {
      readError = e;
    }
    if (!activeAccount(uid, epoch)) return;
    state ||= await cacheGet(`migration-backup:${uid}`);
    if (!activeAccount(uid, epoch)) return;
    if (state) {
      await importState(state);
    } else if (readError) {
      throw readError;
    } else {
      actions.showToast(
        "Esta cuenta no tiene historial anterior en Firebase. Comprueba el correo o recupera los registros del navegador donde usabas la app.",
      );
    }
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export async function rescueLegacyLocalData() {
  const epoch = runtime.authEpoch,
    target = scope;
  try {
    let raw, error;
    try {
      raw = readLegacyDocument(
        {
          stateJson: localStorage.getItem(LEGACY_KEY),
          backupStateJson: localStorage.getItem("allan_tcc_backup_mirror"),
        },
        defaults(),
      )?.state;
    } catch (e) {
      error = e;
    }
    raw ||= await restoreFromIndexedDBVault();
    raw ||= await cacheGet("migration-backup");
    if (epoch !== runtime.authEpoch || target !== scope) return;
    if (raw) await importState(raw);
    else if (error) throw error;
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
