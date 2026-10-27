import test from "node:test";
import assert from "node:assert/strict";
import { makeCalendar, csvCell } from "../src/core/exports.js";
test("calendario mantiene la fecha y escapa contenido de eventos", () => {
  const text = makeCalendar([
    {
      uid: "test",
      date: "2027-02-15",
      time: "08:00",
      endTime: "09:00",
      title: "Actividad\nBEGIN:VEVENT",
      description: "a,b;c",
    },
  ]);
  assert.match(text, /DTSTART:20270215T080000/);
  assert.match(text, /SUMMARY:Actividad\\nBEGIN:VEVENT/);
  assert.equal(text.split("\r\nBEGIN:VEVENT").length, 2);
  assert.match(text, /DESCRIPTION:a\\,b\\;c/);
});
test("CSV neutraliza fórmulas y conserva comillas", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('Una "nota"'), '"Una ""nota"""');
});
