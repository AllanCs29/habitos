import { runtime, actions } from "../core/context.js";
import { isoDate, addDays, validDate, hash } from "../core/domain.js";
const call = async (name, data) => {
  if (!runtime.fbUser)
    throw new Error("Inicia sesión para usar esta integración.");
  const epoch = runtime.authEpoch;
  const result = await runtime.fbFunctions.httpsCallable(name)(data);
  if (epoch !== runtime.authEpoch)
    throw new Error("La cuenta cambió durante la operación.");
  return result.data;
};
const value = (id) => document.getElementById(id)?.value.trim() || "";
export async function saveWorkContactSyncConfig() {
  const wh = runtime.appState.workHub;
  for (const [key, id] of Object.entries({
    workEmail: "workEmailConfigInput",
    workPhone: "workPhoneConfigInput",
    workAliasFilter: "workAliasFilterInput",
    workKeywords: "workKeywordsConfigInput",
    greenApiChatId: "greenApiChatIdInput",
  }))
    wh[key] = value(id);
  const data = {
    greenApiId: value("greenApiIdInput"),
    greenApiToken: value("greenApiTokenInput"),
    callMeBotKey: value("callMeBotKeyInput"),
  };
  wh.greenApiId = data.greenApiId;
  await actions.saveState();
  if (Object.values(data).some(Boolean)) {
    try {
      await call("configureIntegration", data);
      if (data.greenApiToken)
        runtime.appState.workHub.integrationConfigured = "green";
      else if (data.callMeBotKey)
        runtime.appState.workHub.integrationConfigured = "callmebot";
      await actions.saveState();
      for (const id of ["greenApiTokenInput", "callMeBotKeyInput"])
        document.getElementById(id).value = "";
      actions.showToast("Credenciales guardadas en el servidor.", "success");
    } catch (e) {
      actions.showToast(e.message, "error");
      throw e;
    }
  }
}
export async function fetchWhatsAppChatsListViaAPI() {
  try {
    await saveWorkContactSyncConfig();
    const chats = await call("whatsappProxy", { action: "chats" }),
      select = document.getElementById("greenApiChatsDropdown");
    select.replaceChildren(new Option("Mensajes entrantes recientes", ""));
    for (const chat of chats || [])
      select.add(new Option(chat.name || chat.id, chat.id));
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export async function syncIncomingWhatsAppMessagesViaAPI() {
  try {
    await saveWorkContactSyncConfig();
    const chatId = runtime.appState.workHub.greenApiChatId;
    const messages = await call("whatsappProxy", {
      action: chatId ? "history" : "incoming",
      chatId,
    });
    document.getElementById("rawWorkInboxPaste").value = (messages || [])
      .map(
        (m) =>
          `[${m.senderName || m.senderContactName || "WhatsApp"}]: ${m.textMessage || m.extendedTextMessageData?.text || m.caption || ""}`,
      )
      .join("\n");
    actions.showToast(
      "Mensajes cargados. Revisa el texto antes de enviarlo a la IA.",
      "success",
    );
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export async function sendWhatsAppDirectViaAPI() {
  try {
    await saveWorkContactSyncConfig();
    const wh = runtime.appState.workHub,
      message = actions.buildDailyWorkBriefText();
    const target = wh.greenApiChatId || wh.workPhone;
    if (!target) throw new Error("Escribe el destinatario.");
    if (
      !(await actions.reviewAIResult(
        "Revisar envío a WhatsApp",
        `Destinatario: ${target}\n\n${message}`,
      ))
    )
      return;
    await call("whatsappProxy", {
      action: "send",
      phone: wh.workPhone,
      chatId: wh.greenApiChatId,
      message,
    });
    actions.showToast(
      "El proveedor aceptó el envío. La entrega final depende de WhatsApp.",
      "success",
    );
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export function ensureNtfyTopicReady() {
  return runtime.appState.ntfyTopic || value("ntfyTopicInput");
}
export function autoGenerateNtfyTopic() {
  const topic = `tcc_${crypto.randomUUID().replace(/-/g, "")}`;
  document.getElementById("ntfyTopicInput").value = topic;
  actions.showToast("Canal generado. Protégelo en ntfy y configura su token.");
}
export async function saveNtfyTopicConfig() {
  try {
    const topic = value("ntfyTopicInput"),
      token = value("ntfyTokenInput");
    await call("configureIntegration", { ntfyTopic: topic, ntfyToken: token });
    runtime.appState.ntfyTopic = topic;
    document.getElementById("ntfyTokenInput").value = "";
    await actions.saveState();
    actions.showToast(
      "Configuración guardada. Prueba una notificación.",
      "success",
    );
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export function copyNtfyTopic() {
  actions.copyTextSafe(ensureNtfyTopicReady(), "Canal copiado.");
}
export function openNtfyDeepLink() {
  const topic = ensureNtfyTopicReady();
  if (topic)
    window.open(
      `https://ntfy.sh/${encodeURIComponent(topic)}`,
      "_blank",
      "noopener",
    );
}
export function updateCloudPushStatusBadge(text) {
  const node = document.getElementById("cloudPushSyncStatusBadge");
  if (node) node.textContent = text || "Sin verificar";
}
export async function scheduleCloudPushTestIn10Sec() {
  try {
    await call("testNotification", {});
    updateCloudPushStatusBadge("Prueba aceptada por ntfy");
    actions.showToast(
      "Prueba enviada. Comprueba la recepción en ntfy.",
      "success",
    );
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export async function scheduleCloudPushViaNtfy() {
  if (!runtime.appState.notificationsEnabled) return false;
  clearTimeout(runtime.reminderTimer);
  runtime.reminderTimer = setTimeout(
    () => syncAllAlarmsToCloudPushNow(true),
    1500,
  );
  return true;
}
export async function syncAllAlarmsToCloudPushNow(silent = false) {
  try {
    const s = runtime.appState,
      today = isoDate(),
      reminders = [];
    const add = (id, date, time, kind = "activity", daily = false) => {
      if (validDate(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time || ""))
        reminders.push({ id: hash(id), date, time, kind, daily });
    };
    for (const block of s.workHub.scheduleBlocks || [])
      if (!block.done)
        add(`block-${block.id}`, block.date || today, block.startTime);
    const seen = new Set(
      (s.workHub.scheduleBlocks || [])
        .filter((b) => !b.done)
        .map((b) => `${b.code}|${b.startTime}`),
    );
    for (const task of s.tasks || [])
      if (!task.done && !seen.has(`${task.project}|${task.time}`))
        add(`task-${task.id}`, task.workFormat?.dueDate || today, task.time);
    for (const item of s.workHub.inboxItems || [])
      if (
        !item.done &&
        !seen.has(`${item.code}|${item.time}`) &&
        !(s.tasks || []).some((t) => t.project === item.code)
      )
        add(`inbox-${item.id}`, item.date || today, item.time);
    for (const debt of s.finance.debts || [])
      if (!debt.paidThisMonth && debt.dueDate) {
        add(`debt-${debt.id}`, debt.dueDate, "09:00");
        add(`debt-early-${debt.id}`, addDays(debt.dueDate, -1), "09:00");
      }
    add(
      "daily-habit",
      today,
      s.tutorData.streakReminderTime || "20:00",
      "habit",
      true,
    );
    const result = await call("replaceReminders", {
      reminders,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!s.notificationsEnabled) {
      s.notificationsEnabled = true;
      await actions.saveState();
    }
    updateCloudPushStatusBadge(
      `${result.scheduled} recordatorios actualizados`,
    );
    if (!silent)
      actions.showToast(
        "Recordatorios actualizados en el servidor.",
        "success",
      );
    return true;
  } catch (e) {
    updateCloudPushStatusBadge("Pendiente de configurar");
    if (!silent) actions.showToast(e.message, "error");
    return false;
  }
}
export async function disableReminders() {
  try {
    await call("replaceReminders", {
      reminders: [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    runtime.appState.notificationsEnabled = false;
    await actions.saveState();
    updateCloudPushStatusBadge("Recordatorios desactivados");
  } catch (e) {
    actions.showToast(e.message, "error");
  }
}
export function toggleBackgroundKeepAliveMode() {
  actions.showToast(
    "Los avisos con la app cerrada se programan en el servidor. No es necesario mantener el audio ni la pantalla activos.",
  );
}
export async function installPwaAppPrompt() {
  if (runtime.deferredPwaInstallPrompt) {
    await runtime.deferredPwaInstallPrompt.prompt();
    runtime.deferredPwaInstallPrompt = null;
  } else
    actions.showToast(
      "Usa el menú del navegador → Instalar. En Safari de iPhone: Compartir → Agregar a inicio.",
    );
}
