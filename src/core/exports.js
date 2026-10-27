import { validDate, isoDate } from "./domain.js";
export const icalText = (v) =>
  String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
export const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
export function makeCalendar(events) {
  const stamp =
      new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z",
    lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Control TCC Studio//ES",
      "CALSCALE:GREGORIAN",
    ];
  for (const event of events) {
    const {
      date,
      time = "09:00",
      endTime,
      title,
      description = "",
      uid,
      repeat,
      alarmMinutes = 0,
    } = event;
    if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
    const compact = date.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icalText(uid)}@controltcc.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${compact}T${time.replace(":", "")}00`,
      ...(endTime && endTime > time && /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)
        ? [`DTEND:${compact}T${endTime.replace(":", "")}00`]
        : ["DURATION:PT15M"]),
      `SUMMARY:${icalText(title)}`,
      `DESCRIPTION:${icalText(description)}`,
    );
    if (repeat) lines.push("RRULE:FREQ=DAILY;COUNT=30");
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${Math.max(0, Number(alarmMinutes) || 0)}M`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${icalText(title)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return (
    lines
      .map((line) => {
        let out = "",
          count = 0;
        for (const ch of line) {
          const size = new TextEncoder().encode(ch).length;
          if (count + size > 73) {
            out += "\r\n ";
            count = 1;
          }
          out += ch;
          count += size;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
export function downloadText(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
