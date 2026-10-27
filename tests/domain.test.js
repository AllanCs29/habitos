import test from "node:test";
import assert from "node:assert/strict";
import * as d from "../src/core/domain.js";
import { createDefaultState } from "../src/features/model.js";
import { validateResult } from "../functions/schemas.js";
const make = (raw) => d.migrateState(raw, createDefaultState(), "2026-10-26");
test("migración conserva datos de cada módulo y elimina secretos anidados", () => {
  const old = {
    days: {
      "2026-10-20": {
        water: 1500,
        meals: [{ name: "Agua", kcal: 0 }],
        habitsState: { Leer: true },
        impulses: [{ trigger: "Estrés", action: "Respirar" }],
        customNote: "conservar",
      },
    },
    habitsList: [{ id: "leer", name: "Leer" }],
    tasks: [
      {
        id: 4,
        text: "Reporte",
        workFormat: { evidenceImages: ["data:image/png;base64,AAAA"] },
      },
    ],
    gymStructured: {
      "2026-10-20": {
        focus: "Pierna",
        exercises: [{ name: "Sentadilla", done: true }],
      },
    },
    finance: {
      debts: [
        {
          id: 9,
          totalBalance: 1000,
          minPayment: 100,
          paidThisMonth: true,
          dueDate: "2026-10-31",
        },
      ],
    },
    workHub: { greenApiToken: "PRIVATE", scheduleBlocks: [{ title: "Junta" }] },
    apiKey: "PRIVATE",
    customFeature: { preserve: 42 },
    currentDay: "2026-10-20",
  };
  const s = make(old);
  assert.equal(s.days["2026-10-20"].habitsState.leer, true);
  assert.equal(s.days["2026-10-20"].meals[0].kcal, 0);
  assert.equal(s.finance.debts[0].totalBalance, 1000);
  assert.equal(s.finance.debts[0].paidPeriod, "2026-10");
  assert.equal(s.workHub.scheduleBlocks[0].date, "2026-10-20");
  assert.ok(s.days["2026-10-20"].meals[0].id);
  assert.equal(s.customFeature.preserve, 42);
  assert.ok(!JSON.stringify(s).includes("PRIVATE"));
  assert.deepEqual(old.apiKey, "PRIVATE");
  const restored = make(d.fromRecords(d.toRecords(s), createDefaultState()));
  assert.equal(restored.days["2026-10-20"].customNote, "conservar");
  assert.equal(restored.tasks[0].workFormat.evidenceImages.length, 1);
  assert.equal(restored.gymStructured["2026-10-20"].exercises[0].done, true);
});
test("rechaza esquema futuro y contaminación de prototipo", () => {
  assert.throws(() => make({ schemaVersion: 99 }));
  const result = d.safeObject(
    JSON.parse('{"__proto__":{"polluted":true},"constructor":3,"ok":1}'),
  );
  assert.deepEqual(result, { ok: 1 });
  assert.equal({}.polluted, undefined);
});
test("pago, anulación y pago no descuentan dos veces", () => {
  const finance = {
    debts: [
      {
        id: "uuid",
        totalBalance: 1000,
        minPayment: 100,
        dueDate: "2026-10-31",
      },
    ],
    payments: [],
  };
  d.toggleDebtPayment(finance, "uuid", "2026-10-26");
  assert.equal(finance.debts[0].totalBalance, 900);
  d.toggleDebtPayment(finance, "uuid");
  assert.equal(finance.debts[0].totalBalance, 1000);
  d.toggleDebtPayment(finance, "uuid");
  assert.equal(finance.debts[0].totalBalance, 900);
  assert.equal(finance.payments.filter((p) => !p.voidedAt).length, 1);
});
test("pagos históricos sin importe no inventan saldo al anular", () => {
  const s = make({
    finance: {
      debts: [
        {
          id: 1,
          totalBalance: 800,
          minPayment: 100,
          paidThisMonth: true,
          dueDate: "2026-10-31",
        },
      ],
    },
  });
  assert.throws(() => d.toggleDebtPayment(s.finance, 1));
  assert.equal(s.finance.debts[0].totalBalance, 800);
});
test("calendario cruza años y meses cortos", () => {
  assert.equal(d.addDays("2027-01-17", 1), "2027-01-18");
  assert.equal(d.nextMonthlyDate("2028-01-31"), "2028-02-29");
  assert.equal(d.nextMonthlyDate("2027-01-31"), "2027-02-28");
  assert.equal(d.weekDays("2027-01-01")[0].id, "2026-12-28");
  assert.equal(d.validDate("2026-02-30"), false);
});
test("ocho días cumplidos son 100%; futuros no cuentan", () => {
  const h = {
      id: "h",
      createdAt: "2026-10-19",
      targetCount: 1,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
    s = { days: {} };
  for (let i = 0; i < 8; i++)
    s.days[d.addDays(h.createdAt, i)] = { habitsState: { h: true } };
  assert.deepEqual(d.habitStats(s, h, "2026-10-26"), {
    possible: 8,
    done: 8,
    percent: 100,
  });
  assert.equal(d.dueOn(h, "2026-10-27", "2026-10-26"), false);
  assert.equal(d.habitStreak(s, h, "2026-10-26"), 8);
});
test("frecuencia, creación, objetivo y archivo delimitan las estadísticas", () => {
  const h = {
      id: "h",
      createdAt: "2026-10-23",
      weekdays: [1, 2, 3, 4, 5],
      targetCount: 2,
      archivedAt: "2026-10-27",
    },
    s = {
      days: {
        "2026-10-23": { habitValues: { h: 2 } },
        "2026-10-26": { habitValues: { h: 1 } },
      },
    };
  assert.deepEqual(d.habitStats(s, h, "2026-10-31"), {
    possible: 2,
    done: 1,
    percent: 50,
  });
});
test("disponible usa saldo real; ingresos futuros no son efectivo actual", () => {
  const f = {
    availableBalance: 1000,
    incomes: [{ amount: 10000, nextDate: "2026-11-05" }],
    expenses: [{ amount: 200 }],
    debts: [{ minPayment: 300, dueDate: "2026-11-01" }],
  };
  assert.equal(d.cashFlow(f, "2026-10-26").daily, 50);
  assert.equal(
    d.cashFlow({ ...f, availableBalance: null }, "2026-10-26").daily,
    null,
  );
});
test("borrados se propagan como tombstones sin revivir al insertar en otro equipo", () => {
  const s = make({
      tasks: [
        { id: "one", text: "Uno" },
        { id: "two", text: "Dos" },
      ],
    }),
    before = d.toRecords(s);
  s.tasks.shift();
  const deleted = d.diffRecords(before, d.toRecords(s));
  assert.equal(deleted['["tasks","one"]'].deleted, true);
  const stale = make({
    tasks: [
      { id: "new", text: "Nuevo" },
      { id: "one", text: "Uno" },
      { id: "two", text: "Dos" },
    ],
  });
  const changes = d.diffRecords(before, d.toRecords(stale));
  assert.equal(changes['["tasks","one"]'], undefined);
  const merged = d.fromRecords(
    { ...before, ...deleted, ...changes },
    createDefaultState(),
  );
  assert.deepEqual(merged.tasks.map((t) => t.id).sort(), ["new", "two"]);
});
test("validación de horario rechaza cruces, horas imposibles y finales previos", () => {
  for (const blocks of [
    [{ startTime: "24:30", endTime: "25:00" }],
    [{ startTime: "10:00", endTime: "09:00" }],
    [
      { startTime: "09:00", endTime: "11:00" },
      { startTime: "10:00", endTime: "12:00" },
    ],
  ])
    assert.throws(() => d.validateSchedule(blocks));
  assert.equal(
    d.validateSchedule([
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "10:00", endTime: "11:00" },
    ]).length,
    2,
  );
});
test("IA: cero es válido; valores negativos, campos extra y opciones inválidas fallan", () => {
  assert.equal(
    validateResult("meal", { name: "Agua", kcal: 0, p: 0, c: 0, f: 0 }).kcal,
    0,
  );
  assert.throws(() =>
    validateResult("meal", { name: "Agua", kcal: -1, p: 0, c: 0, f: 0 }),
  );
  assert.throws(() =>
    validateResult("connection", { message: "Hola", execute: "rm" }),
  );
  assert.throws(() =>
    validateResult("schedule", {
      blocks: [
        {
          startTime: "09:00",
          endTime: "10:00",
          type: "other",
          code: "x",
          title: "x",
        },
      ],
    }),
  );
});
test("argumentos HTML/JS y fotos no permiten ejecución importada", () => {
  assert.equal(d.safeImageUrl("javascript:alert(1)"), "");
  assert.equal(d.safeImageUrl("data:image/svg+xml;base64,xxx"), "");
  assert.ok(d.inlineArgument('\" onclick=alert(1)').includes("&quot;"));
  assert.ok(d.escapeHtml('<img onerror="x">').includes("&lt;"));
});
test("campos opcionales sin definir no rompen el guardado", () => {
  const s = make({
    workHub: { optional: undefined },
    tutorData: { activeSubjectKey: undefined },
  });
  assert.doesNotThrow(() => d.toRecords(s));
});
