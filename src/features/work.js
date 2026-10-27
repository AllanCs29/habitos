import { runtime, actions } from "../core/context.js";
import * as domain from "../core/domain.js";
import DOMPurify from "dompurify";

export function switchFocusSubTab(sub) {
  runtime.currentFocusSubTab = sub;
  ["agenda", "inbox", "tasks"].forEach((k) => {
    const viewEl = document.getElementById(`focusSubView-${k}`);
    if (viewEl) viewEl.classList.toggle("hidden", k !== sub);
    const btnEl = document.getElementById(`fsub-${k}`);
    if (btnEl) {
      btnEl.className =
        k === sub
          ? "py-2 px-2 rounded-xl bg-terra-500 text-white shadow-sm transition flex items-center justify-center gap-1.5"
          : "py-2 px-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5";
    }
  });
  const activeEl = document.getElementById(`focusSubView-${sub}`);
  if (activeEl) actions.triggerElementSlideAnim(activeEl, "subview-anim-enter");
  actions.renderWorkHubAll();
}

export function saveWorkHoursConfig() {
  if (!runtime.appState.workHub)
    runtime.appState.workHub = actions.createDefaultState().workHub;
  runtime.appState.workHub.workStartHour =
    document.getElementById("workStartHourInput")?.value || "09:00";
  runtime.appState.workHub.workEndHour =
    document.getElementById("workEndHourInput")?.value || "18:00";
  actions.saveState();
  actions.showToast("Horario laboral actualizado", "success");
}

export function selectGreenApiChat(chatIdVal) {
  if (!runtime.appState.workHub) return;
  runtime.appState.workHub.greenApiChatId = chatIdVal || "";
  const inp = document.getElementById("greenApiChatIdInput");
  if (inp) inp.value = chatIdVal || "";
  actions.saveState();
}

export function handleWhatsAppTxtFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const content = String(e.target.result || "");
    const lines = content.split(/\r?\n/).slice(-120).join("\n");
    const box = document.getElementById("rawWorkInboxPaste");
    if (box) box.value = lines;
    actions.showToast(
      "Archivo .TXT de chat de WhatsApp cargado (últimos 120 mensajes). Analizando con IA...",
      "success",
    );
    actions.extractWorkItemsWithAI(true);
  };
  reader.readAsText(file);
}

export function renderWorkHubAll() {
  if (!runtime.appState.workHub)
    runtime.appState.workHub = actions.createDefaultState().workHub;
  const wh = runtime.appState.workHub;

  const sInp = document.getElementById("workStartHourInput");
  const eInp = document.getElementById("workEndHourInput");
  if (sInp && document.activeElement !== sInp)
    sInp.value = wh.workStartHour || "09:00";
  if (eInp && document.activeElement !== eInp)
    eInp.value = wh.workEndHour || "18:00";

  const emInp = document.getElementById("workEmailConfigInput");
  const phInp = document.getElementById("workPhoneConfigInput");
  const alInp = document.getElementById("workAliasFilterInput");
  const kwInp = document.getElementById("workKeywordsConfigInput");
  const gIdInp = document.getElementById("greenApiIdInput");
  const gTkInp = document.getElementById("greenApiTokenInput");
  const gChInp = document.getElementById("greenApiChatIdInput");
  const cmbInp = document.getElementById("callMeBotKeyInput");

  if (emInp && document.activeElement !== emInp)
    emInp.value = wh.workEmail || "";
  if (phInp && document.activeElement !== phInp)
    phInp.value = wh.workPhone || "";
  if (alInp && document.activeElement !== alInp)
    alInp.value = wh.workAliasFilter || runtime.appState.profile?.name || "";
  if (kwInp && document.activeElement !== kwInp)
    kwInp.value = wh.workKeywords || "";
  if (gIdInp && document.activeElement !== gIdInp)
    gIdInp.value = wh.greenApiId || "";
  // Private credentials are write-only and are cleared after successful submission.
  if (gChInp && document.activeElement !== gChInp)
    gChInp.value = wh.greenApiChatId || "";

  const apiBadge = document.getElementById("waApiStatusBadge");
  if (apiBadge) {
    if (wh.integrationConfigured === "green") {
      apiBadge.textContent = "Green-API: credenciales guardadas";
      apiBadge.className =
        "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400";
    } else if (wh.integrationConfigured === "callmebot") {
      apiBadge.textContent = "CallMeBot: credenciales guardadas";
      apiBadge.className =
        "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400";
    } else {
      apiBadge.textContent = "Configura el servicio y prueba la conexión";
      apiBadge.className =
        "text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-400";
    }
  }

  const shiftBadge = document.getElementById("workShiftStatusBadge");
  if (shiftBadge)
    shiftBadge.textContent = `${wh.workStartHour || "09:00"} - ${wh.workEndHour || "18:00"}`;

  const items = wh.inboxItems || [];
  const openTickets = items.filter(
    (i) => i.category === "ticket" && !i.done,
  ).length;
  const openSessions = items.filter(
    (i) => i.category === "session" && !i.done,
  ).length;
  const openTasks = (runtime.appState.tasks || []).filter(
    (t) => !t.done,
  ).length;
  const totalOpenInbox = items.filter((i) => !i.done).length;

  const tkEl = document.getElementById("summaryOpenTicketsCount");
  const sesEl = document.getElementById("summaryTodaySessionsCount");
  const tskEl = document.getElementById("summaryPendingTasksCount");
  const badgeEl = document.getElementById("focusInboxBadgeCount");

  if (tkEl) tkEl.textContent = openTickets;
  if (sesEl) sesEl.textContent = openSessions;
  if (tskEl) tskEl.textContent = openTasks;
  if (badgeEl) {
    badgeEl.textContent = totalOpenInbox;
    badgeEl.classList.toggle("hidden", totalOpenInbox === 0);
  }

  actions.renderDailyScheduleTimeline();
  actions.renderWorkInboxItems();
}

export function renderDailyScheduleTimeline() {
  const container = document.getElementById("dailyScheduleTimeline");
  if (!container || !runtime.appState.workHub) return;
  const blocks = (runtime.appState.workHub.scheduleBlocks || [])
    .filter((b) => b.date === runtime.appState.currentDay)
    .slice()
    .sort((a, b) =>
      (a.startTime || "00:00").localeCompare(b.startTime || "00:00"),
    );

  if (blocks.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic p-3 text-center">No hay bloques en tu agenda hoy. Agrega uno arriba o presiona "Auto-Agendar Día con IA".</p>`;
    return;
  }

  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const typeMeta = {
    ticket: {
      icon: "🎫",
      label: "Ticket",
      cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    },
    session: {
      icon: "📹",
      label: "Sesión",
      cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    },
    task: {
      icon: "📌",
      label: "Tarea",
      cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
    break: {
      icon: "☕",
      label: "Pausa",
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
  };

  container.innerHTML = blocks
    .map((b) => {
      const meta = typeMeta[b.type] || typeMeta.task;
      const isCurrent =
        !b.done &&
        (b.startTime || "") <= nowHHMM &&
        (b.endTime || "23:59") >= nowHHMM;
      return `
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border ${isCurrent ? "border-terra-500 ring-1 ring-terra-500/40" : "border-slate-200 dark:border-slate-800"} flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <input type="checkbox" ${b.done ? "checked" : ""} onchange="toggleScheduleBlockDone(${domain.inlineArgument(b.id)})" class="w-4 h-4 accent-emerald-500 rounded cursor-pointer shrink-0">
              <div class="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center shrink-0">
                <span class="font-black font-mono text-xs block">${actions.escapeHtmlSafe(b.startTime || "--:--")}</span>
                <span class="text-[9px] font-mono text-slate-400 block">${actions.escapeHtmlSafe(b.endTime || "")}</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span class="px-2 py-0.5 rounded-md text-[9px] font-extrabold border ${meta.cls}">${meta.icon} ${meta.label}</span>
                  ${b.code ? `<span class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[9px] font-mono font-bold">${actions.escapeHtmlSafe(b.code)}</span>` : ""}
                  ${isCurrent ? `<span class="px-2 py-0.5 rounded-full bg-terra-500 text-white text-[9px] font-black animate-pulse">EN CURSO</span>` : ""}
                </div>
                <p class="font-bold ${b.done ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-100"} break-words">${actions.escapeHtmlSafe(b.title)}</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button onclick="promoteScheduleBlockToOfficialTask(${domain.inlineArgument(b.id)})" class="px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 font-bold text-[10px] hover:bg-blue-500/25" title="Pasar a Tareas Oficiales para Reporte PDF">+ A PDF</button>
              <button onclick="deleteScheduleBlock(${domain.inlineArgument(b.id)})" class="text-slate-400 hover:text-rose-500 px-1"><i class="fi fi-rr-trash"></i></button>
            </div>
          </div>
        `;
    })
    .join("");
}

export function addManualScheduleBlock() {
  const startTime =
    document.getElementById("schedBlockStart")?.value || "09:00";
  const endTime = document.getElementById("schedBlockEnd")?.value || "10:00";
  const type = document.getElementById("schedBlockType")?.value || "task";
  const titleInput = document.getElementById("schedBlockTitle");
  const title = (titleInput?.value || "").trim();
  if (!title) {
    actions.showToast("Escribe la actividad o sesión para agendar", "warning");
    return;
  }

  try {
    domain.validateSchedule([
      ...(runtime.appState.workHub.scheduleBlocks || []).filter(
        (b) => b.date === runtime.appState.currentDay,
      ),
      { startTime, endTime },
    ]);
  } catch (e) {
    actions.showToast(e.message, "warning");
    return;
  }
  runtime.appState.workHub.scheduleBlocks.push({
    date: runtime.appState.currentDay,
    id: domain.newId(),
    startTime,
    endTime,
    type,
    code:
      type === "ticket" ? "TICKET" : type === "session" ? "SESIÓN" : "AGENDA",
    title,
    done: false,
    notified: false,
  });
  if (titleInput) titleInput.value = "";
  actions.saveState();
  actions.scheduleCloudPushViaNtfy(
    `📅 Agenda (${startTime}): ${title}`,
    startTime,
    `Horario asignado: ${startTime} a ${endTime}`,
  );
  actions.showToast("Bloque agregado a tu agenda", "success");
}

export function toggleScheduleBlockDone(id) {
  const b = (runtime.appState.workHub?.scheduleBlocks || []).find(
    (x) => String(x.id) === String(id),
  );
  if (!b) return;
  b.done = !b.done;
  actions.saveState();
}

export function deleteScheduleBlock(id) {
  if (!runtime.appState.workHub) return;
  runtime.appState.workHub.scheduleBlocks = (
    runtime.appState.workHub.scheduleBlocks || []
  ).filter((x) => String(x.id) !== String(id));
  actions.saveState();
}

export function clearCompletedScheduleBlocks() {
  if (!runtime.appState.workHub) return;
  runtime.appState.workHub.scheduleBlocks = (
    runtime.appState.workHub.scheduleBlocks || []
  ).filter((x) => !x.done || x.date !== runtime.appState.currentDay);
  actions.saveState();
  actions.showToast("Bloques completados limpiados", "info");
}

export function promoteScheduleBlockToOfficialTask(id) {
  const b = (runtime.appState.workHub?.scheduleBlocks || []).find(
    (x) => String(x.id) === String(id),
  );
  if (!b) return;
  const projNum = b.code || String((runtime.appState.tasks || []).length + 1);
  runtime.appState.tasks.unshift({
    id: Date.now(),
    text: b.title,
    time: b.startTime || "09:00",
    solicita: "Lucia",
    project: projNum,
    tag: "Trabajo",
    done: !!b.done,
    notified: false,
    selectedForPdf: true,
    workFormat: {
      taskNumber: projNum,
      solicita: "Lucia",
      assignDate: runtime.appState.currentDay,
      dueDate: runtime.appState.currentDay,
      status: b.done ? "Completado" : "En Progreso",
      startTime: b.startTime || "",
      endTime: b.endTime || "",
      activityDesc: b.title,
      notes: `Agendado en bloque ${b.startTime} - ${b.endTime}`,
      deliverable: "",
      evidenceImages: [],
    },
  });
  actions.saveState();
  actions.showToast(
    "Enviado a Tareas Oficiales para tu Reporte PDF",
    "success",
  );
}

export function importPendingTasksAndTicketsToSchedule() {
  if (!runtime.appState.workHub) return;
  let added = 0;
  const existing = new Set(
    (runtime.appState.workHub.scheduleBlocks || []).map((b) =>
      (b.title || "").toLowerCase(),
    ),
  );

  (runtime.appState.workHub.inboxItems || [])
    .filter((i) => !i.done)
    .forEach((item) => {
      if (!existing.has(item.title.toLowerCase())) {
        const st = item.time || "10:00";
        const [hh, mm] = st.split(":").map(Number);
        const endHH = String(Math.min(23, (hh || 10) + 1)).padStart(2, "0");
        runtime.appState.workHub.scheduleBlocks.push({
          date: runtime.appState.currentDay,
          id: Date.now() + Math.floor(Math.random() * 1000) + added,
          startTime: st,
          endTime: `${endHH}:${String(mm || 0).padStart(2, "0")}`,
          type: item.category || "ticket",
          code: item.code || "TRABAJO",
          title: item.title,
          done: false,
          notified: false,
        });
        existing.add(item.title.toLowerCase());
        added++;
      }
    });

  (runtime.appState.tasks || [])
    .filter((t) => !t.done)
    .forEach((task) => {
      if (!existing.has(task.text.toLowerCase())) {
        const st = task.time || "12:00";
        const [hh, mm] = st.split(":").map(Number);
        const endHH = String(Math.min(23, (hh || 12) + 1)).padStart(2, "0");
        runtime.appState.workHub.scheduleBlocks.push({
          date: runtime.appState.currentDay,
          id: Date.now() + Math.floor(Math.random() * 1000) + added,
          startTime: st,
          endTime: `${endHH}:${String(mm || 0).padStart(2, "0")}`,
          type: "task",
          code: task.project || "PDF",
          title: task.text,
          done: false,
          notified: false,
        });
        existing.add(task.text.toLowerCase());
        added++;
      }
    });

  actions.saveState();
  actions.showToast(
    added > 0
      ? `${added} actividad(es) integradas a tu agenda de hoy`
      : "Tus tickets y tareas ya están en la agenda",
    "success",
  );
}

export async function autoOrganizeDayScheduleWithAI() {
  const originDate = runtime.appState.currentDay,
    originEpoch = runtime.authEpoch;
  if (!actions.isAIReady()) {
    actions.importPendingTasksAndTicketsToSchedule();
    return;
  }
  const btn = document.getElementById("btnAutoScheduleAI");
  const orig = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Organizando horario...</span>`;
  }
  try {
    const startH = runtime.appState.workHub?.workStartHour || "09:00";
    const endH = runtime.appState.workHub?.workEndHour || "18:00";
    const openInbox = (runtime.appState.workHub?.inboxItems || []).filter(
      (i) => !i.done,
    );
    const openTasks = (runtime.appState.tasks || []).filter((t) => !t.done);
    const prompt = `Organiza una agenda laboral realista sin traslapes dentro del horario de trabajo (${startH} a ${endH}).
        Respeta las horas de sesiones/juntas, asigna bloques productivos a los tickets urgentes y tareas de reporte PDF, e incluye 1 hora de comida.
        TICKETS Y SESIONES PENDIENTES: ${JSON.stringify(openInbox)}
        TAREAS PDF PENDIENTES: ${JSON.stringify(openTasks.map((t) => ({ text: t.text, time: t.time, project: t.project })))}
        Devuelve ÚNICAMENTE un JSON válido:
        {
          "blocks": [
            { "startTime": "09:00", "endTime": "09:30", "type": "session", "code": "DAILY", "title": "..." }
          ]
        }
        Donde "type" solo puede ser "ticket", "session", "task" o "break".`;

    const res = await actions.callGeminiAPI(prompt, null, "schedule");
    if (originEpoch !== runtime.authEpoch) return;
    const parsed = JSON.parse(res);
    if (parsed.blocks) {
      domain.validateSchedule(parsed.blocks);
      if (
        !(await actions.reviewAIResult(
          "Revisar agenda",
          parsed.blocks
            .map((b) => b.startTime + "–" + b.endTime + " " + b.title)
            .join("\n") +
            "\nSe reemplazarán los bloques del " +
            originDate +
            ".",
        ))
      )
        return;
    }
    if (parsed && Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
      runtime.appState.workHub.scheduleBlocks = [
        ...runtime.appState.workHub.scheduleBlocks.filter(
          (b) => b.date !== originDate,
        ),
        ...parsed.blocks.map((b, idx) => ({
          date: originDate,
          id: Date.now() + idx,
          startTime: b.startTime || "09:00",
          endTime: b.endTime || "10:00",
          type: ["ticket", "session", "task", "break"].includes(b.type)
            ? b.type
            : "task",
          code: b.code || "IA",
          title: b.title || "Actividad laboral",
          done: false,
          notified: false,
        })),
      ];
      actions.saveState();
      actions.showToast("Agenda revisada y guardada", "success");
    } else {
      actions.importPendingTasksAndTicketsToSchedule();
    }
  } catch (e) {
    actions.showToast(
      e.message || "No se pudo preparar la agenda. No se guardaron cambios.",
      "error",
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
}

export function filterWorkInbox(cat) {
  if (!runtime.appState.workHub) return;
  runtime.appState.workHub.inboxFilter = cat;
  ["all", "ticket", "session", "task"].forEach((c) => {
    const b = document.getElementById(`winbox-filter-${c}`);
    if (b) {
      b.className =
        c === cat
          ? "px-3 py-1.5 rounded-xl text-[11px] font-black bg-terra-500 text-white"
          : "px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400";
    }
  });
  actions.renderWorkInboxItems();
}

export function renderWorkInboxItems() {
  const container = document.getElementById("workInboxItemsList");
  if (!container || !runtime.appState.workHub) return;
  const filter = runtime.appState.workHub.inboxFilter || "all";
  const items = (runtime.appState.workHub.inboxItems || []).filter(
    (i) => filter === "all" || i.category === filter,
  );

  if (items.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 italic p-3 text-center">No hay elementos en esta vista. Pega arriba tus correos o mensajes de WhatsApp del trabajo para que la IA extraiga tickets, sesiones y pendientes.</p>`;
    return;
  }

  const catBadge = {
    ticket: {
      icon: "🎫",
      name: "Ticket",
      cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    },
    session: {
      icon: "📹",
      name: "Sesión",
      cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    },
    task: {
      icon: "📌",
      name: "Pendiente",
      cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
  };

  container.innerHTML = items
    .map((item) => {
      const meta = catBadge[item.category] || catBadge.task;
      return `
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="flex items-start gap-2.5 min-w-0 flex-1">
              <input type="checkbox" ${item.done ? "checked" : ""} onchange="toggleWorkInboxItemDone(${domain.inlineArgument(item.id)})" class="w-4 h-4 mt-0.5 accent-emerald-500 rounded cursor-pointer shrink-0">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                  <span class="px-2 py-0.5 rounded-md text-[9px] font-extrabold border ${meta.cls}">${meta.icon} ${meta.name}</span>
                  ${item.code ? `<span class="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[9px] font-mono font-bold">${actions.escapeHtmlSafe(item.code)}</span>` : ""}
                  ${item.time ? `<span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 text-[9px] font-mono font-bold">⏰ ${actions.escapeHtmlSafe(item.time)}</span>` : ""}
                  ${item.source ? `<span class="text-[10px] text-slate-400 font-semibold">• ${actions.escapeHtmlSafe(item.source)}${item.sender ? " (" + actions.escapeHtmlSafe(item.sender) + ")" : ""}</span>` : ""}
                </div>
                <p class="font-bold ${item.done ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-100"} break-words">${actions.escapeHtmlSafe(item.title)}</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button onclick="sendWorkInboxItemToSchedule(${domain.inlineArgument(item.id)})" class="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-400 font-bold text-[10px] hover:bg-sky-500/25">+ Agenda</button>
              <button onclick="promoteWorkInboxItemToPDFTask(${domain.inlineArgument(item.id)})" class="px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-400 font-bold text-[10px] hover:bg-blue-500/25">+ Plantilla PDF</button>
              <button onclick="deleteWorkInboxItem(${domain.inlineArgument(item.id)})" class="text-slate-400 hover:text-rose-500 px-1"><i class="fi fi-rr-trash"></i></button>
            </div>
          </div>
        `;
    })
    .join("");
}

export function addManualWorkInboxItem() {
  const category =
    document.getElementById("manualWorkItemCategory")?.value || "ticket";
  const code =
    (document.getElementById("manualWorkItemCode")?.value || "").trim() ||
    (category === "ticket"
      ? "TK-" + Math.floor(100 + Math.random() * 900)
      : "TRABAJO");
  const titleInp = document.getElementById("manualWorkItemTitle");
  const title = (titleInp?.value || "").trim();
  const time = document.getElementById("manualWorkItemTime")?.value || "11:00";
  if (!title) {
    actions.showToast(
      "Escribe el asunto del ticket, sesión o pendiente",
      "warning",
    );
    return;
  }

  runtime.appState.workHub.inboxItems.unshift({
    id: Date.now(),
    category,
    code,
    title,
    time,
    sender: "Registro Directo",
    source: "Manual",
    priority: "Alta",
    done: false,
    scheduled: false,
    notified: false,
  });
  if (titleInp) titleInp.value = "";
  actions.saveState();
  actions.scheduleCloudPushViaNtfy(
    `💼 ${code}: ${title}`,
    time,
    `Programado a las ${time}`,
  );
  actions.showToast("Elemento laboral guardado y alerta programada", "success");
}

export function toggleWorkInboxItemDone(id) {
  const item = (runtime.appState.workHub?.inboxItems || []).find(
    (x) => String(x.id) === String(id),
  );
  if (!item) return;
  item.done = !item.done;
  actions.saveState();
}

export function deleteWorkInboxItem(id) {
  if (!runtime.appState.workHub) return;
  runtime.appState.workHub.inboxItems = (
    runtime.appState.workHub.inboxItems || []
  ).filter((x) => String(x.id) !== String(id));
  actions.saveState();
}

export function sendWorkInboxItemToSchedule(id) {
  const item = (runtime.appState.workHub?.inboxItems || []).find(
    (x) => String(x.id) === String(id),
  );
  if (!item) return;
  const st = item.time || "11:00";
  const [hh, mm] = st.split(":").map(Number);
  const endHH = String(Math.min(23, (hh || 11) + 1)).padStart(2, "0");
  try {
    domain.validateSchedule([
      ...(runtime.appState.workHub.scheduleBlocks || []).filter(
        (b) => b.date === runtime.appState.currentDay,
      ),
      { startTime, endTime },
    ]);
  } catch (e) {
    actions.showToast(e.message, "warning");
    return;
  }
  runtime.appState.workHub.scheduleBlocks.push({
    date: runtime.appState.currentDay,
    id: domain.newId(),
    startTime: st,
    endTime: `${endHH}:${String(mm || 0).padStart(2, "0")}`,
    type: item.category || "ticket",
    code: item.code || "TRABAJO",
    title: item.title,
    done: false,
    notified: false,
  });
  item.scheduled = true;
  actions.saveState();
  actions.showToast("Agregado a tu Agenda Diaria", "success");
}

export function promoteWorkInboxItemToPDFTask(id) {
  const item = (runtime.appState.workHub?.inboxItems || []).find(
    (x) => String(x.id) === String(id),
  );
  if (!item) return;
  const projNum =
    item.code || String((runtime.appState.tasks || []).length + 1);
  runtime.appState.tasks.unshift({
    id: Date.now(),
    text: item.title,
    time: item.time || "11:00",
    solicita: item.sender || "Lucia",
    project: projNum,
    tag: "Trabajo",
    done: !!item.done,
    notified: false,
    selectedForPdf: true,
    workFormat: {
      taskNumber: projNum,
      solicita: item.sender || "Lucia",
      assignDate: runtime.appState.currentDay,
      dueDate: runtime.appState.currentDay,
      status: item.done ? "Completado" : "En Progreso",
      startTime: item.time || "",
      endTime: "",
      activityDesc: item.title,
      notes: `Extraído de ${item.source || "Correo/Whats"} (${item.code || ""})`,
      deliverable: "",
      evidenceImages: [],
    },
  });
  actions.saveState();
  actions.showToast(
    "Copiado a Tareas Oficiales para tu Reporte PDF",
    "success",
  );
}

export async function handleWorkInboxImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  runtime.pendingWorkInboxImageBase64 = await actions.compressImageFile(
    file,
    900,
    0.8,
  );
  const badge = document.getElementById("workInboxImageBadge");
  if (badge) badge.classList.remove("hidden");
  actions.showToast(
    "Captura de Correo/WhatsApp lista para escanear",
    "success",
  );
}

export function loadSampleWorkEmailsAndWhats() {
  const sample = `Correo de: mesa.ayuda@empresa.com - Asunto: [URGENTE] Ticket INC-4892 Revisar escaneo de documentos y subir evidencia antes de las 13:30.
WhatsApp de Lucia: "Hola! Recuerda que hoy a las 11:00 tenemos la sesión con PLS por Meet para revisar los pendientes de la semana."
WhatsApp de Amigo: "¿Vamos por unas alitas el viernes?" (mensaje personal, ignorar)
Correo de Coordinación: "Favor de mandar el reporte PDF firmado antes de las 17:00 hrs."`;
  const box = document.getElementById("rawWorkInboxPaste");
  if (box) box.value = sample;
  actions.showToast(
    "Ejemplo cargado. Presiona Extraer Tickets/Sesiones.",
    "info",
  );
}

export async function extractWorkItemsWithAI(autoAddToSchedule = true) {
  const originDate = runtime.appState.currentDay,
    originEpoch = runtime.authEpoch;
  const rawText = (
    document.getElementById("rawWorkInboxPaste")?.value || ""
  ).trim();
  if (!rawText && !runtime.pendingWorkInboxImageBase64) {
    actions.showToast(
      "Pega tus correos/mensajes de WhatsApp o sube una captura primero",
      "warning",
    );
    return;
  }
  if (!actions.isAIReady()) {
    actions.showToast(
      "Inicia sesión y configura el servicio de IA en Ajustes para usar el escáner IA",
      "warning",
    );
    actions.switchTab("settings");
    return;
  }
  const btn = document.getElementById("btnScanWorkInboxAI");
  const orig = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>Filtrando solo trabajo con IA...</span>`;
  }

  try {
    const myAlias = (
      runtime.appState.workHub?.workAliasFilter ||
      runtime.appState.profile?.name ||
      ""
    ).trim();
    const keywords = (
      runtime.appState.workHub?.workKeywords ||
      "Ticket, Folio, Incidencia, Sesión, Junta, Urgente, Apoyo"
    ).trim();
    const prompt = `Actúa como un asistente ejecutivo conectado al grupo de trabajo de WhatsApp y correo del usuario.
        REGLA DE FILTRADO ESTRICTO PARA GRUPOS DE TRABAJO:
        1. Nombre / Alias del usuario: "${myAlias || "El usuario actual"}".
        2. Palabras clave y tickets que le interesan: "${keywords}".
        3. Analiza la conversación del grupo o contactos. IGNORA pláticas casuales y también IGNORA tareas que le hayan dejado explícitamente a OTRA persona distinta a "${myAlias || "el usuario"}".
        4. Extrae ÚNICAMENTE:
           - Actividades o pendientes que le pidan explícitamente a "${myAlias || "el usuario"}" o a todo el equipo.
           - Tickets ("ticket") que lleguen por WhatsApp o correo para que se vayan juntando y ordenando.
           - Sesiones o juntas ("session") con su hora.

        MENSAJES / CORREOS A ANALIZAR:
        ---
        ${rawText}
        ---

        Devuelve ÚNICAMENTE un JSON válido con esta estructura:
        {
          "items": [
            {
              "category": "ticket",
              "code": "INC-4892",
              "title": "Descripción clara del ticket, sesión o tarea",
              "time": "13:30",
              "sender": "Lucia / Mesa de Ayuda",
              "source": "Correo",
              "priority": "Alta"
            }
          ]
        }`;

    const resText = await actions.callGeminiAPI(
      prompt,
      runtime.pendingWorkInboxImageBase64,
      "inbox",
    );
    if (originEpoch !== runtime.authEpoch) return;
    const parsed = JSON.parse(resText);
    const extracted = (
      parsed && Array.isArray(parsed.items) ? parsed.items : []
    ).filter(
      (it) =>
        !runtime.appState.workHub.inboxItems.some(
          (old) =>
            old.date === originDate &&
            old.code === it.code &&
            old.title === it.title,
        ),
    );
    if (
      extracted.length &&
      !(await actions.reviewAIResult(
        "Revisar actividades detectadas",
        extracted
          .map((it) => (it.time || "Sin hora") + " · " + it.title)
          .join("\n") +
          "\nSe agregarán a tu bandeja y tareas. Revisa destinatarios, fechas y horarios.",
      ))
    )
      return;

    if (extracted.length === 0) {
      actions.showToast(
        "No se detectaron tickets o sesiones laborales en el mensaje",
        "info",
      );
    } else {
      extracted.forEach((it, idx) => {
        const newId = domain.newId();
        const cat = ["ticket", "session", "task"].includes(it.category)
          ? it.category
          : "task";
        const timeStr = /^([01]\d|2[0-3]):[0-5]\d$/.test(it.time || "")
          ? it.time
          : "";
        const itemObj = {
          date: originDate,
          id: newId,
          category: cat,
          code: it.code || (cat === "ticket" ? "TK-IA" : "SYNC"),
          title: it.title || "Pendiente laboral",
          time: timeStr,
          sender: it.sender || "Trabajo",
          source: it.source || "IA Sync",
          priority: it.priority || "Alta",
          done: false,
          scheduled: autoAddToSchedule && !!timeStr,
          notified: false,
        };
        runtime.appState.workHub.inboxItems.unshift(itemObj);

        // Sincronizar también en la lista de Tareas Oficiales PDF para que el usuario pueda generar su PDF directo sin pasos extra
        runtime.appState.tasks.unshift({
          id: domain.newId(),
          text: itemObj.title,
          time: timeStr,
          solicita: itemObj.sender || "Grupo Trabajo",
          project: itemObj.code,
          tag: "Trabajo",
          done: false,
          notified: false,
          selectedForPdf: true,
          workFormat: {
            taskNumber: itemObj.code,
            solicita: itemObj.sender || "Grupo Trabajo",
            assignDate: originDate,
            dueDate: originDate,
            status: "En Progreso",
            startTime: timeStr,
            endTime: "",
            activityDesc: itemObj.title,
            notes: `Recibido vía ${itemObj.source} (${itemObj.sender})`,
            deliverable: "",
            evidenceImages: [],
          },
        });

        if (autoAddToSchedule && timeStr) {
          const [hh, mm] = timeStr.split(":").map(Number);
          const endHH = String(Math.min(23, hh + 1)).padStart(2, "0");
          runtime.appState.workHub.scheduleBlocks.push({
            date: originDate,
            id: domain.newId(),
            startTime: timeStr,
            endTime: `${endHH}:${String(mm || 0).padStart(2, "0")}`,
            type: cat,
            code: itemObj.code,
            title: itemObj.title,
            done: false,
            notified: false,
          });
        }
        actions.scheduleCloudPushViaNtfy(
          `💼 [${itemObj.code}] ${itemObj.title}`,
          timeStr,
          `Vía ${itemObj.source} (${itemObj.sender})`,
        );
      });

      runtime.pendingWorkInboxImageBase64 = null;
      const badge = document.getElementById("workInboxImageBadge");
      if (badge) badge.classList.add("hidden");
      const box = document.getElementById("rawWorkInboxPaste");
      if (box) box.value = "";
      actions.saveState();
      actions.showToast(
        `${extracted.length} elemento(s) del trabajo extraídos y agendados`,
        "success",
      );
    }
  } catch (err) {
    actions.showToast("Error al escanear: " + err.message, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }
}

export function buildDailyWorkBriefText() {
  const today = runtime.appState.currentDay;
  const openTickets = (runtime.appState.workHub?.inboxItems || []).filter(
    (i) => i.category === "ticket" && !i.done,
  );
  const openSessions = (runtime.appState.workHub?.inboxItems || []).filter(
    (i) => i.category === "session" && !i.done,
  );
  const blocks = (runtime.appState.workHub?.scheduleBlocks || [])
    .filter((b) => !b.done)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  const pdfTasks = (runtime.appState.tasks || []).filter((t) => !t.done);

  const lines = [`*💼 RESUMEN LABORAL CONTROL TCC (${today})*`, ""];
  if (openSessions.length > 0) {
    lines.push("*📹 SESIONES / JUNTAS HOY:*");
    openSessions.forEach((s) =>
      lines.push(`• ${s.time || "--:--"} - [${s.code}] ${s.title}`),
    );
    lines.push("");
  }
  if (openTickets.length > 0) {
    lines.push("*🎫 TICKETS ABIERTOS:*");
    openTickets.forEach((t) =>
      lines.push(`• [${t.code}] ${t.title} (${t.time || "Pendiente"})`),
    );
    lines.push("");
  }
  if (blocks.length > 0) {
    lines.push("*📅 AGENDA DEL DÍA:*");
    blocks.forEach((b) =>
      lines.push(`• ${b.startTime}-${b.endTime}: ${b.title}`),
    );
    lines.push("");
  }
  if (pdfTasks.length > 0) {
    lines.push("*📋 ACTIVIDADES PARA REPORTE PDF:*");
    pdfTasks.forEach((t) =>
      lines.push(
        `• #${t.project || "1"} ${t.text} (Solicita: ${t.solicita || "Lucia"})`,
      ),
    );
  }
  return lines.join("\n");
}

export function sendDailyWorkBriefToWhatsApp() {
  const phone = (runtime.appState.workHub?.workPhone || "").replace(/\D/g, "");
  const text = encodeURIComponent(actions.buildDailyWorkBriefText());
  const url = phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;
  window.open(url, "_blank", "noopener");
}

export function sendDailyWorkBriefToEmail() {
  const email = (runtime.appState.workHub?.workEmail || "").trim();
  const subject = encodeURIComponent(
    `Resumen de Tickets, Sesiones y Agenda - ${runtime.appState.currentDay}`,
  );
  const body = encodeURIComponent(actions.buildDailyWorkBriefText());
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}
