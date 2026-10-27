import { runtime, actions } from "../core/context.js";
import { isoDate } from "../core/domain.js";
import { makeCalendar, downloadText } from "../core/exports.js";
export function downloadMasterNativeAlarmsICS() {
  const s = runtime.appState,
    today = isoDate(),
    events = [];
  for (const b of s.workHub.scheduleBlocks || [])
    if (!b.done && b.startTime)
      events.push({
        uid: "block-" + b.id,
        date: b.date || today,
        time: b.startTime,
        endTime: b.endTime,
        title: b.title,
        description: b.code,
        alarmMinutes: 5,
      });
  for (const i of s.workHub.inboxItems || [])
    if (
      !i.done &&
      i.time &&
      !s.workHub.scheduleBlocks.some(
        (b) => b.date === i.date && b.code === i.code && b.startTime === i.time,
      )
    )
      events.push({
        uid: "inbox-" + i.id,
        date: i.date || today,
        time: i.time,
        title: i.title,
        description: i.source,
        alarmMinutes: 10,
      });
  for (const t of s.tasks || [])
    if (
      !t.done &&
      t.time &&
      !s.workHub.scheduleBlocks.some(
        (b) =>
          b.code === t.project &&
          b.startTime === t.time &&
          b.date === (t.workFormat?.dueDate || today),
      )
    )
      events.push({
        uid: "task-" + t.id,
        date: t.workFormat?.dueDate || today,
        time: t.time,
        title: t.text,
        description: t.solicita,
      });
  for (const d of s.finance.debts || [])
    if (!d.paidThisMonth && d.dueDate)
      events.push({
        uid: "debt-" + d.id + "-" + d.dueDate,
        date: d.dueDate,
        time: "09:00",
        title: "Pago: " + d.name,
        description: "Pago previsto: " + actions.formatMoneyMXN(d.minPayment),
        alarmMinutes: 1440,
      });
  events.push({
    uid: "study-reminder",
    date: today,
    time: s.tutorData.streakReminderTime || "20:00",
    title: "Un momento para aprender",
    repeat: true,
  });
  downloadText(
    makeCalendar(events),
    "Control-TCC-recordatorios.ics",
    "text/calendar;charset=utf-8",
  );
  actions.showToast(
    "Archivo descargado. Impórtalo en tu calendario y comprueba sus avisos.",
    "success",
  );
}
