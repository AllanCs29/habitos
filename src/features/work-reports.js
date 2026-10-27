import { makeCalendar, downloadText, csvCell } from "../core/exports.js";
import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function updatePomoDisplay() {
  const m = String(Math.floor(runtime.pomoSeconds / 60)).padStart(2, "0");
  const s = String(runtime.pomoSeconds % 60).padStart(2, "0");
  document.getElementById("pomoDisplay").textContent = `${m}:${s}`;
}

export function setPomodoroMode(minutes, label) {
  clearInterval(runtime.pomoInterval);
  runtime.pomoInterval = null;
  runtime.pomoSeconds = minutes * 60;
  document.getElementById("pomoStatusBadge").textContent = label;
  document.getElementById("pomoStartBtn").textContent = "Iniciar";
  actions.updatePomoDisplay();
}

export function togglePomodoro() {
  const button = document.getElementById("pomoStartBtn");
  if (runtime.pomoInterval) {
    clearInterval(runtime.pomoInterval);
    runtime.pomoInterval = null;
    runtime.pomoSeconds = Math.max(
      0,
      Math.ceil((runtime.pomoEndsAt - Date.now()) / 1000),
    );
    runtime.pomoEndsAt = null;
    button.textContent = "Reanudar";
    actions.updatePomoDisplay();
    return;
  }
  if (runtime.pomoSeconds <= 0) runtime.pomoSeconds = 25 * 60;
  runtime.pomoEndsAt = Date.now() + runtime.pomoSeconds * 1000;
  button.textContent = "Pausar";
  const tick = () => {
    runtime.pomoSeconds = Math.max(
      0,
      Math.ceil((runtime.pomoEndsAt - Date.now()) / 1000),
    );
    actions.updatePomoDisplay();
    if (!runtime.pomoSeconds) {
      clearInterval(runtime.pomoInterval);
      runtime.pomoInterval = null;
      button.textContent = "Iniciar";
      actions.sendPhoneNotification(
        "Sesión de enfoque terminada",
        "Toma un descanso y registra tu avance.",
      );
      actions.showToast("Sesión de enfoque completada.", "success");
    }
  };
  runtime.pomoInterval = setInterval(tick, 500);
  tick();
}

export async function enableBrowserNotifications() {
  if (!("Notification" in window)) {
    actions.showToast(
      "Este navegador no admite avisos locales. Puedes usar ntfy.",
      "warning",
    );
    return;
  }
  const permission = await Notification.requestPermission();
  runtime.appState.localAlertsEnabled = permission === "granted";
  actions.saveState();
  actions.showToast(
    permission === "granted"
      ? "Avisos locales habilitados mientras la app esté abierta."
      : "No se concedió permiso para avisos locales.",
  );
}

export function sendPhoneNotification(title, body, tag = "tcc-alert") {
  if (
    !runtime.appState.localAlertsEnabled ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return;
  if (runtime.globalSwRegistration)
    runtime.globalSwRegistration
      .showNotification(title, {
        body,
        tag,
        icon: new URL("icon.svg", document.baseURI).href,
      })
      .catch(() => {});
  else {
    try {
      new Notification(title, { body, tag });
    } catch {}
  }
}

export async function testMobileNotificationNow() {
  actions.playBeep();
  if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
  if ("Notification" in window && Notification.permission !== "granted") {
    await Notification.requestPermission();
  }
  const sent = actions.sendPhoneNotification(
    "🔥 Prueba Control TCC: Protector de Racha",
    "Tu sonido, vibración y alertas están funcionando correctamente.",
    "tcc-test-" + Date.now(),
  );
  actions.triggerStreakCelebration(
    "🔔 Alerta Móvil Probada",
    sent
      ? "Notificación enviada a la barra de tu teléfono"
      : "Sonido activo (Usa Alarma Nativa para app cerrada)",
  );
  actions.showToast(
    sent
      ? "Notificación enviada a tu celular"
      : "Sonido probado. Activa Permiso Push o Alarma Nativa",
    "success",
  );
}

export function saveStreakReminderTime(val) {
  const td = actions.ensureTutorMultiSubjectStructure();
  td.streakReminderTime = val || "20:00";
  td.lastStreakRiskAlertDay = "";
  actions.saveState();
  actions.scheduleCloudPushViaNtfy(
    "🔥 ¡Cuidado con tu racha de estudio en Profe IA!",
    td.streakReminderTime,
    "Aún estás a tiempo de completar 1 lección hoy en Control TCC para que no se corte tu racha.",
  );
  actions.showToast(
    `Aviso anti-corte de racha programado a las ${td.streakReminderTime} (Local + Cloud Push)`,
    "success",
  );
}

export function downloadStreakNativePhoneAlarm() {
  const td = actions.ensureTutorMultiSubjectStructure();
  const timeVal =
    td.streakReminderTime ||
    document.getElementById("streakReminderTimeInput")?.value ||
    "20:00";
  const [hh, min] = timeVal.split(":");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const startStr = `${yyyy}${mm}${dd}T${hh || "20"}${min || "00"}00`;
  const endStr = `${yyyy}${mm}${dd}T${hh || "20"}${String(Math.min(59, parseInt(min || "0", 10) + 15)).padStart(2, "0")}00`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Control TCC//Streak Protector//ES",
    "BEGIN:VEVENT",
    "SUMMARY:🔥 ¡No pierdas tu Racha de Estudio en Tu Profe IA!",
    "DESCRIPTION:Abre Control TCC y completa 1 lección hoy para mantener viva tu racha diaria.",
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    "RRULE:FREQ=DAILY",
    "BEGIN:VALARM",
    "TRIGGER:-PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:🔥 ¡Tu racha de estudio está por cortarse! Toma tu clase de hoy.",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `protector_racha_diaria_${hh || "20"}h.ics`;
  link.click();
  actions.showToast(
    "Alarma diaria nativa descargada: ábrela para que tu celular te avise aunque cierres el navegador",
    "success",
  );
}

export function isTimeReachedWithinWindow(targetHHMM, windowMinutes = 15) {
  if (!targetHHMM || !/^\d{2}:\d{2}$/.test(targetHHMM)) return false;
  const now = new Date();
  const [th, tm] = targetHHMM.split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const targetMins = th * 60 + tm;
  return nowMins >= targetMins && nowMins - targetMins <= windowMinutes;
}

export function checkAlarmsAndStreakRisk() {
  if (!runtime.appState.localAlertsEnabled) return;
  const today = domain.isoDate();
  let changed = false;
  const notify = (item, date, time, title) => {
    if (
      item.done ||
      date !== today ||
      item.notifiedDate === today ||
      !actions.isTimeReachedWithinWindow(time, 15)
    )
      return;
    item.notifiedDate = today;
    changed = true;
    actions.sendPhoneNotification("Control TCC", title, String(item.id));
    actions.showToast(title);
  };
  for (const t of runtime.appState.tasks || [])
    notify(
      t,
      t.workFormat?.dueDate || t.workFormat?.assignDate,
      t.time,
      t.text,
    );
  for (const b of runtime.appState.workHub.scheduleBlocks || [])
    notify(b, b.date, b.startTime, b.title);
  if (changed) actions.saveState();
}

export function downloadTaskPhoneAlarm(idx) {
  const t = runtime.appState.tasks[idx];
  if (!t) return;
  downloadText(
    makeCalendar([
      {
        uid: "task-" + t.id,
        date: t.workFormat?.dueDate || runtime.appState.currentDay,
        time: t.time || "12:00",
        title: t.text,
        description: t.solicita || "",
      },
    ]),
    "Control-TCC-tarea.ics",
    "text/calendar;charset=utf-8",
  );
  actions.showToast(
    "Importa el archivo en tu calendario para activar el aviso.",
  );
}

export async function handleTaskEvidenceUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;
  for (const f of files) {
    const compressed = await actions.compressImageFile(f, 800, 0.68);
    runtime.currentModalEvidenceImages.push(compressed);
  }
  actions.renderModalEvidenceGallery();
  actions.showToast(
    `${files.length} imagen(es) adjuntada(s) al reporte`,
    "success",
  );
}

export function removeModalEvidenceImage(imgIdx) {
  runtime.currentModalEvidenceImages.splice(imgIdx, 1);
  actions.renderModalEvidenceGallery();
}

export function renderModalEvidenceGallery() {
  const gal = document.getElementById("wfEvidenceGallery");
  if (!gal) return;
  if (runtime.currentModalEvidenceImages.length === 0) {
    gal.innerHTML = `<p class="col-span-3 text-[10px] text-slate-400 italic">Sin capturas adjuntas aún.</p>`;
  } else {
    gal.innerHTML = runtime.currentModalEvidenceImages
      .map(
        (src, i) => `
          <div class="relative group rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 h-20 bg-slate-950">
            <img src="${actions.escapeHtmlSafe(domain.safeImageUrl(src))}" class="w-full h-full object-cover">
            <button onclick="removeModalEvidenceImage(${i})" class="absolute top-1 right-1 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              <i class="fi fi-rr-cross-small"></i>
            </button>
          </div>
        `,
      )
      .join("");
  }
}

export function openTaskFormatModal(idx, isFromAlarm = false) {
  runtime.activeFormatTaskIndex = idx;
  runtime.activeFormatTaskId = runtime.appState.tasks[idx]?.id;
  const t = runtime.appState.tasks[idx];
  if (!t) return;

  document
    .getElementById("alarmBannerBox")
    .classList.toggle("hidden", !isFromAlarm);
  document.getElementById("formatModalTaskTitle").textContent = t.text;
  const wf = t.workFormat || {};
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  document.getElementById("wfTaskNumber").value =
    wf.taskNumber || t.project || String(idx + 1);
  document.getElementById("wfSolicita").value =
    wf.solicita || t.solicita || "Por definir";
  document.getElementById("wfAssignDate").value =
    wf.assignDate || runtime.appState.currentDay;
  document.getElementById("wfDueDate").value =
    wf.dueDate || runtime.appState.currentDay;
  document.getElementById("wfStartTime").value = wf.startTime || t.time || "";
  document.getElementById("wfEndTime").value = wf.endTime || nowHHMM;
  document.getElementById("wfStatus").value = wf.status || "Completado";
  document.getElementById("wfActivityDesc").value =
    wf.activityDesc || t.text || "";
  document.getElementById("wfNotes").value = wf.notes || "";
  document.getElementById("wfDeliverable").value = wf.deliverable || "";

  runtime.currentModalEvidenceImages = Array.isArray(wf.evidenceImages)
    ? [...wf.evidenceImages]
    : [];
  actions.renderModalEvidenceGallery();

  document.getElementById("taskFormatModal").classList.remove("hidden");
}

export function closeTaskFormatModal() {
  actions.stopAlarmSound();
  document.getElementById("taskFormatModal").classList.add("hidden");
  runtime.activeFormatTaskIndex = null;
}

export function saveTaskWorkFormat(silent = false) {
  runtime.activeFormatTaskIndex = runtime.appState.tasks.findIndex(
    (t) => t.id === runtime.activeFormatTaskId,
  );
  if (runtime.activeFormatTaskIndex < 0) {
    actions.showToast("La tarea fue eliminada o cambió de cuenta.", "warning");
    return;
  }
  const t = runtime.appState.tasks[runtime.activeFormatTaskIndex];

  t.project = document.getElementById("wfTaskNumber").value.trim() || "1";
  t.solicita =
    document.getElementById("wfSolicita").value.trim() || "Por definir";
  t.text = document.getElementById("wfActivityDesc").value.trim() || t.text;

  t.workFormat = {
    taskNumber: t.project,
    solicita: t.solicita,
    assignDate:
      document.getElementById("wfAssignDate").value ||
      runtime.appState.currentDay,
    dueDate:
      document.getElementById("wfDueDate").value || runtime.appState.currentDay,
    status: document.getElementById("wfStatus").value,
    startTime: document.getElementById("wfStartTime").value,
    endTime: document.getElementById("wfEndTime").value,
    activityDesc: t.text,
    notes: document.getElementById("wfNotes").value.trim(),
    deliverable: document.getElementById("wfDeliverable").value.trim(),
    evidenceImages: [...runtime.currentModalEvidenceImages],
  };
  t.done = t.workFormat.status === "Completado";
  t.selectedForPdf = true;

  if (!silent) actions.closeTaskFormatModal();
  actions.saveState();
  if (!silent) actions.showToast("Formato y evidencias guardados", "success");
}

export function exportSingleTaskFromModalPDF() {
  if (runtime.activeFormatTaskIndex === null) return;
  actions.saveTaskWorkFormat(true);
  const t = runtime.appState.tasks[runtime.activeFormatTaskIndex];
  actions.closeTaskFormatModal();
  actions.generateOfficialPDFDocument([t]);
}

export function toggleTaskPdfSelect(idx) {
  if (!runtime.appState.tasks[idx]) return;
  runtime.appState.tasks[idx].selectedForPdf =
    !runtime.appState.tasks[idx].selectedForPdf;
  actions.saveState();
}

export function formatShortDateDDMMYY(isoStr) {
  if (!isoStr) return "22-10-26";
  const parts = isoStr.split("-");
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}-${parts[1]}-${parts[0].slice(-2)}`;
}

export function getUnifiedTasksForPDF() {
  const selectedTasks = (runtime.appState.tasks || []).filter(
    (t) => t.selectedForPdf !== false,
  );
  if (selectedTasks.length > 0) return selectedTasks;
  if ((runtime.appState.tasks || []).length > 0) return runtime.appState.tasks;

  // Si el usuario tiene actividades en su Agenda o Bandeja de Correo/Whats pero aún no las pasaba a Tareas PDF, las incluimos automáticamente:
  const autoList = [];
  (runtime.appState.workHub?.inboxItems || []).forEach((it, idx) => {
    autoList.push({
      id: it.id || Date.now() + idx,
      text: it.title,
      time: it.time || "",
      solicita: it.sender || "Área Solicitante",
      project: it.code || String(idx + 1),
      done: !!it.done,
      workFormat: {
        taskNumber: it.code || String(idx + 1),
        solicita: it.sender || "Área Solicitante",
        assignDate: runtime.appState.currentDay,
        dueDate: runtime.appState.currentDay,
        status: it.done ? "Completado" : "En Progreso",
        startTime: it.time || "",
        endTime: "",
        activityDesc: it.title,
        notes: `Origen: ${it.source || "WhatsApp / Correo"}`,
        deliverable: it.done
          ? "Actividad completada y verificada."
          : "En seguimiento.",
        evidenceImages: [],
      },
    });
  });
  (runtime.appState.workHub?.scheduleBlocks || []).forEach((b, idx) => {
    if (b.type === "break") return;
    autoList.push({
      id: b.id || Date.now() + 100 + idx,
      text: b.title,
      time: b.startTime || "",
      solicita: "Agenda Diaria",
      project: b.code || String(autoList.length + 1),
      done: !!b.done,
      workFormat: {
        taskNumber: b.code || String(autoList.length + 1),
        solicita: "Agenda Diaria",
        assignDate: runtime.appState.currentDay,
        dueDate: runtime.appState.currentDay,
        status: b.done ? "Completado" : "En Progreso",
        startTime: b.startTime || "",
        endTime: b.endTime || "",
        activityDesc: b.title,
        notes: `Horario programado: ${b.startTime || "--:--"} a ${b.endTime || "--:--"}`,
        deliverable: "",
        evidenceImages: [],
      },
    });
  });
  return autoList;
}

export function buildExecutivePdfHtml(tasksToExport) {
  const responsibleName = actions.escapeHtmlSafe(
    runtime.appState.profile?.name || "Responsable",
  );
  return tasksToExport
    .map((t, index) => {
      const wf = t.workFormat || {};
      const numTarea = actions.escapeHtmlSafe(
        wf.taskNumber || t.project || String(index + 1),
      );
      const fAsig = actions.escapeHtmlSafe(
        actions.formatShortDateDDMMYY(
          wf.assignDate || runtime.appState.currentDay,
        ),
      );
      const fLim = actions.escapeHtmlSafe(
        actions.formatShortDateDDMMYY(
          wf.dueDate || runtime.appState.currentDay,
        ),
      );
      const solicita = actions.escapeHtmlSafe(
        wf.solicita || t.solicita || "Por especificar",
      );
      const statusStr = wf.status || (t.done ? "Completado" : "En Progreso");
      const horarioStr =
        wf.startTime || t.time
          ? `${actions.escapeHtmlSafe(wf.startTime || t.time)}${wf.endTime ? " - " + actions.escapeHtmlSafe(wf.endTime) : ""}`
          : "Jornada laboral";
      const actividadHtml = actions
        .escapeHtmlSafe(wf.activityDesc || t.text || "")
        .replace(/\n/g, "<br>");
      const obsHtml = actions
        .escapeHtmlSafe(wf.notes || "Sin observaciones adicionales.")
        .replace(/\n/g, "<br>");
      const evidTextHtml = actions
        .escapeHtmlSafe(wf.deliverable || "")
        .replace(/\n/g, "<br>");
      const images = Array.isArray(wf.evidenceImages) ? wf.evidenceImages : [];

      const statusBadgeBg =
        statusStr === "Completado"
          ? "#dcfce7"
          : statusStr === "Pendiente"
            ? "#fef3c7"
            : "#dbeafe";
      const statusBadgeColor =
        statusStr === "Completado"
          ? "#166534"
          : statusStr === "Pendiente"
            ? "#92400e"
            : "#1e40af";

      const imagesHtml =
        images.length > 0
          ? `
          <div style="margin-top: 14px; display: grid; grid-template-columns: repeat(${images.length === 1 ? 1 : 2}, 1fr); gap: 12px;">
            ${images
              .map(
                (imgSrc, imgI) => `
              <div style="border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px; background: #f8fafc;">
                <div style="font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                  📸 Evidencia Fotográfica #${imgI + 1}
                </div>
                <img src="${actions.escapeHtmlSafe(domain.safeImageUrl(imgSrc))}" style="width: 100%; max-height: 290px; object-fit: contain; border-radius: 6px; display: block; background: #0f172a;" />
              </div>
            `,
              )
              .join("")}
          </div>
        `
          : "";

      return `
          <div style="${index > 0 ? "page-break-before: always;" : ""} padding: 18px; color: #0f172a; background: #ffffff; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;">
            <!-- Encabezado Corporativo Ejecutivo -->
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; padding: 18px 22px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div>
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #93c5fd; font-weight: 800;">
                  REPORTE OFICIAL DE ACTIVIDAD Y EVIDENCIA DOCUMENTAL
                </div>
                <div style="font-size: 18px; font-weight: 900; margin-top: 3px;">
                  Reporte Individual de Tarea • Folio #${numTarea}
                </div>
              </div>
              <div style="text-align: right;">
                <span style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; display: inline-block;">
                  ${actions.escapeHtmlSafe(statusStr)}
                </span>
                <div style="font-size: 10px; color: #cbd5e1; margin-top: 5px;">
                  Fecha de corte: ${fAsig}
                </div>
              </div>
            </div>

            <!-- Ficha Técnica de Metadatos (4 columnas) -->
            <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 14px;">
              <tr>
                <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px;">
                  <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Número / Folio</div>
                  <div style="font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 2px;">#${numTarea}</div>
                </td>
                <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px;">
                  <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Responsable</div>
                  <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">${responsibleName}</div>
                </td>
                <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px;">
                  <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Solicita / Área</div>
                  <div style="font-size: 13px; font-weight: 800; color: #1e40af; margin-top: 2px;">${solicita}</div>
                </td>
                <td style="width: 25%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px;">
                  <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b;">Asignación / Límite</div>
                  <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-top: 2px;">${fAsig} → ${fLim} (${horarioStr})</div>
                </td>
              </tr>
            </table>

            <!-- Bloque 1: Tarea o Actividad -->
            <div style="border: 1px solid #cbd5e1; border-left: 5px solid #2563eb; border-radius: 10px; background: #ffffff; padding: 12px 16px; margin-bottom: 12px;">
              <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #2563eb; margin-bottom: 5px;">
                1. Tarea o Actividad Realizada
              </div>
              <div style="font-size: 13px; line-height: 1.5; color: #0f172a; font-weight: 600;">
                ${actividadHtml || "Actividad registrada."}
              </div>
            </div>

            <!-- Bloque 2: Observaciones -->
            <div style="border: 1px solid #cbd5e1; border-left: 5px solid #ea580c; border-radius: 10px; background: #fffaf5; padding: 12px 16px; margin-bottom: 12px;">
              <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #ea580c; margin-bottom: 5px;">
                2. Observaciones y Seguimiento
              </div>
              <div style="font-size: 12px; line-height: 1.5; color: #334155;">
                ${obsHtml}
              </div>
            </div>

            <!-- Bloque 3: Evidencia Documental y Capturas -->
            <div style="border: 1px solid #cbd5e1; border-left: 5px solid #059669; border-radius: 10px; background: #ffffff; padding: 14px 16px; min-height: 110px;">
              <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; color: #059669; margin-bottom: 6px;">
                3. Evidencia, Entregables y Anexos Fotográficos
              </div>
              <div style="font-size: 12px; line-height: 1.55; color: #1e293b;">
                ${evidTextHtml || (images.length > 0 ? "Se adjunta evidencia gráfica a continuación." : "Actividad verificada en sistema.")}
              </div>
              ${imagesHtml}
            </div>

            <!-- Pie de Página Ejecutivo -->
            <div style="margin-top: 16px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
              <span>Generado por <strong>Control TCC Master Cloud</strong></span>
              <span>Responsable: <strong>${responsibleName}</strong> • Fecha: ${fAsig}</span>
            </div>
          </div>
        `;
    })
    .join("");
}

export async function generateOfficialPDFDocument(tasksToExport) {
  const list =
    tasksToExport && tasksToExport.length > 0
      ? tasksToExport
      : actions.getUnifiedTasksForPDF();
  if (!list || list.length === 0) {
    actions.showToast(
      "Agrega primero al menos una tarea, ticket o bloque de agenda para generar tu PDF",
      "warning",
    );
    return;
  }
  runtime.currentPdfTasksBuffer = list;
  const wrapper = document.getElementById("pdfPrintWrapper");
  const modal = document.getElementById("pdfPreviewModal");
  if (wrapper) {
    wrapper.innerHTML = actions.buildExecutivePdfHtml(list);
  }
  if (modal) {
    modal.classList.remove("hidden");
  }
  // Iniciar descarga directa del archivo PDF con html2pdf mientras el modal es visible (evita que html2canvas capture un lienzo en blanco)
  await actions.triggerDirectHtml2PdfDownload();
}

export async function triggerDirectHtml2PdfDownload() {
  const wrapper = document.getElementById("pdfPrintWrapper");
  if (!wrapper || !wrapper.innerHTML.trim()) return;
  const btn = document.getElementById("btnConfirmPdfDownload");
  const orig = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Generando PDF...</span>`;
  }
  try {
    const responsibleName = (
      runtime.appState.profile?.name || "Reporte"
    ).replace(/\s+/g, "_");
    if (typeof html2pdf === "function") {
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `Reporte_Ejecutivo_${responsibleName}_${runtime.appState.currentDay}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };
      await html2pdf().set(opt).from(wrapper).save();
      actions.showToast("PDF Ejecutivo descargado correctamente", "success");
    } else {
      actions.printExecutivePdfWindow();
    }
  } catch (e) {
    console.warn("Fallback impresión nativa:", e);
    actions.printExecutivePdfWindow();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
}

export function printExecutivePdfWindow() {
  const wrapper = document.getElementById("pdfPrintWrapper");
  if (!wrapper) return;
  const win = window.open("", "_blank");
  if (!win) {
    window.print();
    return;
  }
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte Ejecutivo Control TCC</title><style>@page { size: A4 portrait; margin: 10mm; } body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head><body>${wrapper.innerHTML}<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script></body></html>`,
  );
  win.document.close();
}

export function closePdfPreviewModal() {
  const modal = document.getElementById("pdfPreviewModal");
  if (modal) modal.classList.add("hidden");
}

export function downloadOfficialTasksPDF() {
  const list = actions.getUnifiedTasksForPDF();
  actions.generateOfficialPDFDocument(list);
}

export function renderTasks() {
  const el = document.getElementById("tasksList");
  const badgeEl = document.getElementById("workReportCountBadge");
  if (badgeEl) badgeEl.textContent = `${runtime.appState.tasks.length} tareas`;

  if (runtime.appState.tasks.length === 0) {
    el.innerHTML = `<p class="text-xs text-slate-400 italic">No hay actividades registradas. Agrega una arriba.</p>`;
    return;
  }

  el.innerHTML = runtime.appState.tasks
    .map((t, i) => {
      const wf = t.workFormat || {};
      const imgCount = (wf.evidenceImages || []).length;
      const hasFormat = !!(wf.deliverable || imgCount > 0);
      const isSelectedPdf = t.selectedForPdf !== false;

      return `
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border ${hasFormat ? "border-emerald-500/40" : "border-slate-200 dark:border-slate-800"} text-xs space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-start gap-2.5 flex-1">
                <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleTask(${i})" class="w-4 h-4 mt-0.5 accent-emerald-500 rounded cursor-pointer">
                <div class="flex-1">
                  <p class="${t.done ? "line-through text-slate-400" : "font-bold text-slate-800 dark:text-slate-100"}">${actions.escapeHtmlSafe(t.text)}</p>
                  <div class="flex flex-wrap items-center gap-1.5 mt-1">
                    <span class="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-400 font-bold">Solicita: ${actions.escapeHtmlSafe(wf.solicita || t.solicita || "Por definir")}</span>
                    ${t.project ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-bold">#${actions.escapeHtmlSafe(t.project)}</span>` : ""}
                    ${t.time ? `<span class="text-[10px] text-amber-400 font-bold flex items-center gap-1"><i class="fi fi-rr-clock"></i> ${actions.escapeHtmlSafe(t.time)}</span>` : ""}
                    ${imgCount > 0 ? `<span class="text-[10px] text-emerald-400 font-bold flex items-center gap-1"><i class="fi fi-rr-picture"></i> ${imgCount}</span>` : ""}
                  </div>
                </div>
              </div>
              <button onclick="deleteTask(${i})" class="text-slate-400 hover:text-rose-500 px-1">
                <i class="fi fi-rr-trash"></i>
              </button>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700/60 gap-2">
              <label class="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold cursor-pointer">
                <input type="checkbox" ${isSelectedPdf ? "checked" : ""} onchange="toggleTaskPdfSelect(${i})" class="accent-blue-500">
                <span>Incluir en PDF</span>
              </label>
              <div class="flex gap-1.5">
                <button onclick="openTaskFormatModal(${i})" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[10px] flex items-center gap-1">
                  <i class="fi fi-rr-edit"></i> <span>${hasFormat ? "Editar / Fotos" : "Llenar y Subir Fotos"}</span>
                </button>
                <button onclick="generateOfficialPDFDocument([appState.tasks[${i}]])" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[10px] flex items-center gap-1">
                  <i class="fi fi-rr-file-pdf"></i> <span>PDF</span>
                </button>
                ${t.time ? `<button onclick="downloadTaskPhoneAlarm(${i})" class="px-2 py-1 bg-amber-500/20 text-amber-400 rounded-lg font-bold text-[10px]"><i class="fi fi-rr-calendar-clock"></i></button>` : ""}
              </div>
            </div>
          </div>
        `;
    })
    .join("");
}

export function addTask() {
  const input = document.getElementById("newTaskInput");
  const timeInput = document.getElementById("newTaskTime").value;
  const solicitaInput =
    document.getElementById("newTaskSolicita").value.trim() || "Por definir";
  const projInput =
    document.getElementById("newTaskProject").value.trim() ||
    String(runtime.appState.tasks.length + 1);
  if (!input.value.trim()) {
    actions.showToast("Escribe la tarea o actividad", "warning");
    return;
  }

  runtime.appState.tasks.unshift({
    id: Date.now(),
    text: input.value.trim(),
    time: timeInput,
    solicita: solicitaInput,
    project: projInput,
    tag: "Trabajo",
    done: false,
    notified: false,
    selectedForPdf: true,
    workFormat: {
      taskNumber: projInput,
      solicita: solicitaInput,
      assignDate: runtime.appState.currentDay,
      dueDate: runtime.appState.currentDay,
      status: "En Progreso",
      activityDesc: input.value.trim(),
      notes: "",
      deliverable: "",
      evidenceImages: [],
    },
  });
  input.value = "";
  document.getElementById("newTaskTime").value = "";
  document.getElementById("newTaskProject").value = "";
  actions.saveState();
  if (timeInput) {
    actions.scheduleCloudPushViaNtfy(
      `⏰ Actividad Laboral: ${runtime.appState.tasks[0].text}`,
      timeInput,
      `Solicita: ${solicitaInput} • Folio #${projInput}`,
    );
  }
  actions.showToast("Actividad agregada.", "success");
}

export function toggleTask(i) {
  runtime.appState.tasks[i].done = !runtime.appState.tasks[i].done;
  actions.saveState();
  if (runtime.appState.tasks[i].done) actions.openTaskFormatModal(i, false);
}

export function deleteTask(i) {
  runtime.appState.tasks.splice(i, 1);
  actions.saveState();
}

export function buildWorkReportText() {
  const user = runtime.appState.profile.name || "Usuario";
  return runtime.appState.tasks
    .map((t, idx) => {
      const wf = t.workFormat || {};
      return `TAREA #${wf.taskNumber || idx + 1} | Fecha: ${runtime.appState.currentDay}\nResponsable: ${user} | Solicita: ${wf.solicita || t.solicita || "Por definir"}\nActividad: ${wf.activityDesc || t.text}\nObservaciones: ${wf.notes || "---"}\nEvidencia: ${wf.deliverable || "---"}\n`;
    })
    .join("\n-----------------------------------\n");
}

export function copyTextSafe(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => actions.showToast(successMsg, "success"))
      .catch(() => actions.fallbackCopyText(text, successMsg));
  } else {
    actions.fallbackCopyText(text, successMsg);
  }
}

export function fallbackCopyText(text, successMsg) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    actions.showToast(successMsg, "success");
  } catch (e) {
    actions.showToast("No se pudo copiar automáticamente", "warning");
  }
}

export function copyWorkFormatReport() {
  actions.copyTextSafe(
    actions.buildWorkReportText(),
    "Texto copiado al portapapeles",
  );
}

export function downloadWorkFormatCSV() {
  if (runtime.appState.tasks.length === 0) return;
  const headers = [
    "Num_Tarea",
    "Fecha_Asignacion",
    "Responsable",
    "Solicita",
    "Fecha_Limite",
    "Tarea_Actividad",
    "Observaciones",
    "Evidencia",
  ];
  const rows = runtime.appState.tasks.map((t, idx) => {
    const wf = t.workFormat || {};
    const cols = [
      wf.taskNumber || idx + 1,
      wf.assignDate || runtime.appState.currentDay,
      runtime.appState.profile.name || "Usuario",
      wf.solicita || t.solicita || "Por definir",
      wf.dueDate || runtime.appState.currentDay,
      wf.activityDesc || t.text,
      wf.notes || "",
      wf.deliverable || "",
    ];
    return cols.map(csvCell).join(",");
  });
  const blob = new Blob(["\uFEFF" + [headers.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Reporte_Tareas_${runtime.appState.currentDay}.csv`;
  link.click();
}
