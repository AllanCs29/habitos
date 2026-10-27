/** Pure domain logic. No browser, Firebase or AI dependencies. */
export const SCHEMA_VERSION = 2;
export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
export const isoDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function addDays(iso, count) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + count);
  return isoDate(d);
}
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
    isoDate(new Date(`${value}T12:00:00`)) === value
  );
}
export function weekDays(selected = isoDate()) {
  const day = new Date(`${selected}T12:00:00`).getDay();
  const monday = addDays(selected, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => dayInfo(addDays(monday, i)));
}
export function dayInfo(id) {
  const d = new Date(`${id}T12:00:00`);
  return {
    id,
    dayName: DAY_NAMES[d.getDay()],
    label: `${["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()]} ${d.getDate()}`,
    short: ["D", "L", "M", "M", "J", "V", "S"][d.getDay()],
  };
}
export function calendarDays(selected = isoDate()) {
  const monday = weekDays(selected)[0].id;
  return Array.from({ length: 21 }, (_, i) => dayInfo(addDays(monday, i - 7)));
}
export const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export const clone = (value) => JSON.parse(JSON.stringify(value));
export function hash(value) {
  let n = 2166136261;
  for (const c of String(value)) {
    n ^= c.charCodeAt(0);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0).toString(36);
}
export const numberIn = (v, min = 0, max = 1e9) =>
  Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : min;
export const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeObject(value) {
  if (Array.isArray(value)) return value.map(safeObject);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) => !["__proto__", "prototype", "constructor"].includes(key),
        )
        .map(([key, v]) => [key, safeObject(v)]),
    );
  return value;
}
export function withoutSecrets(input) {
  const secret =
    /^(apiKey|greenApiToken|callMeBotKey|password|accessToken|refreshToken|ntfyToken)$/i;
  function walk(v) {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !secret.test(k))
          .map(([k, x]) => [k, walk(x)]),
      );
    return v;
  }
  return walk(safeObject(input));
}
export function emptyDay() {
  return {
    water: 0,
    meals: [],
    habitsState: {},
    habitValues: {},
    impulses: [],
  };
}
export function migrateState(raw, defaults, today = isoDate()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("El respaldo no contiene un objeto válido.");
  if (raw.schemaVersion > SCHEMA_VERSION)
    throw new Error(
      "Este respaldo requiere una versión más reciente de la aplicación.",
    );
  const s = { ...clone(defaults), ...withoutSecrets(raw) };
  s.schemaVersion = SCHEMA_VERSION;
  s.profile = { ...defaults.profile, ...s.profile };
  s.workHub = { ...defaults.workHub, ...s.workHub };
  s.finance = { ...defaults.finance, ...s.finance };
  s.tutorData = { ...defaults.tutorData, ...s.tutorData };
  for (const key of ["days", "gymStructured", "exerciseHistory"])
    if (!s[key] || typeof s[key] !== "object" || Array.isArray(s[key]))
      s[key] = {};
  const ids = (a, prefix) =>
    Array.isArray(a)
      ? a
          .filter((x) => x && typeof x === "object")
          .map((x, i) => ({
            ...x,
            id: String(
              x.id ?? `legacy_${prefix}_${i}_${hash(JSON.stringify(x))}`,
            ),
          }))
      : [];
  for (const key of ["tasks", "groceries"]) s[key] = ids(s[key], key);
  const oldHabits = Array.isArray(s.habitsList) ? s.habitsList : [];
  s.habitsList = oldHabits
    .map((h, i) =>
      typeof h === "string"
        ? { id: `h_${i}_${h.toLowerCase().replace(/[^a-z0-9]/g, "")}`, name: h }
        : h,
    )
    .filter((h) => h && h.name)
    .map((h, i) => {
      const id = String(h.id ?? `legacy_habit_${i}_${hash(h.name)}`);
      const first = Object.keys(s.days)
        .filter(
          (d) =>
            validDate(d) &&
            (s.days[d]?.habitsState?.[id] || s.days[d]?.habitsState?.[h.name]),
        )
        .sort()[0];
      return {
        ...h,
        id,
        createdAt: validDate(h.createdAt) ? h.createdAt : first || today,
        targetCount: numberIn(h.targetCount || 1, 1, 10000),
        weekdays: Array.isArray(h.weekdays)
          ? h.weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
          : [0, 1, 2, 3, 4, 5, 6],
      };
    });
  const deleted = new Set(
    (s.deletedHabitsRegistry || []).map((x) => String(x).toLowerCase()),
  );
  s.habitsList = s.habitsList.filter(
    (h) =>
      !deleted.has(h.id.toLowerCase()) && !deleted.has(h.name.toLowerCase()),
  );
  for (const [date, data] of Object.entries(s.days)) {
    if (!validDate(date) || !data || typeof data !== "object") continue;
    const d = (s.days[date] = { ...emptyDay(), ...data });
    d.meals = ids(d.meals, `meal_${date}`).map((m) => ({
      ...m,
      source: m.source || "legacy",
      kcal: numberIn(m.kcal ?? m.calories),
      p: numberIn(m.p ?? m.protein),
      c: numberIn(m.c ?? m.carbs),
      f: numberIn(m.f ?? m.fat),
    }));
    d.impulses = ids(d.impulses, `impulse_${date}`);
    d.habitsState = { ...d.habitsState };
    d.habitValues = { ...d.habitValues };
    d.water = numberIn(d.water, 0, 20000);
    for (const h of s.habitsList) {
      if (d.habitsState[h.name] === true) d.habitsState[h.id] = true;
      delete d.habitsState[h.name];
    }
  }
  for (const key of ["incomes", "expenses", "debts", "payments"])
    s.finance[key] = ids(s.finance[key], key);
  for (const debt of s.finance.debts) {
    if (debt.openingBalance === undefined)
      debt.openingBalance = numberIn(debt.totalBalance);
    if (debt.paidThisMonth && !debt.paidPeriod)
      debt.paidPeriod = (validDate(debt.dueDate) ? debt.dueDate : today).slice(
        0,
        7,
      );
    debt.paidThisMonth =
      debt.paidPeriod ===
      (validDate(debt.dueDate) ? debt.dueDate : today).slice(0, 7);
  }
  for (const key of ["scheduleBlocks", "inboxItems"])
    s.workHub[key] = ids(s.workHub[key], key).map((x) => ({
      ...x,
      date: validDate(x.date)
        ? x.date
        : validDate(raw.currentDay)
          ? raw.currentDay
          : today,
    }));
  for (const [date, gym] of Object.entries(s.gymStructured)) {
    if (gym && typeof gym === "object")
      gym.exercises = ids(gym.exercises, `gym_${date}`);
  }
  s.tutorData.subjectsMap = { ...s.tutorData.subjectsMap };
  for (const [key, subject] of Object.entries(s.tutorData.subjectsMap))
    if (subject) subject.lessons = ids(subject.lessons, `lesson_${key}`);
  s.currentDay = validDate(s.currentDay) ? s.currentDay : today;
  s.days[s.currentDay] ||= emptyDay();
  s.selectedModel = s.selectedModel || "gemini-3.8-flash";
  s.thinkingLevel = s.thinkingLevel || "LOW";
  return s;
}
export function dueOn(h, date, today = isoDate()) {
  return (
    validDate(date) &&
    date <= today &&
    date >= (h.createdAt || date) &&
    (!h.archivedAt || date < h.archivedAt) &&
    (h.weekdays || [0, 1, 2, 3, 4, 5, 6]).includes(
      new Date(`${date}T12:00:00`).getDay(),
    )
  );
}
export function checked(s, h, date) {
  return (
    s.days[date]?.habitsState?.[h.id] === true ||
    numberIn(s.days[date]?.habitValues?.[h.id]) >= (h.targetCount || 1)
  );
}
export function habitStats(s, h, end = isoDate()) {
  let possible = 0,
    done = 0;
  const start =
    h.createdAt || Object.keys(s.days).filter(validDate).sort()[0] || end;
  for (
    let d = start, count = 0;
    d <= end && count < 36600;
    d = addDays(d, 1), count++
  )
    if (dueOn(h, d, end)) {
      possible++;
      if (checked(s, h, d)) done++;
    }
  return {
    possible,
    done,
    percent: possible ? Math.round((done / possible) * 100) : 0,
  };
}
export function habitStreak(s, h, end = isoDate()) {
  let n = 0;
  for (
    let d = end, i = 0;
    i < 36600 && d >= (h.createdAt || "2000-01-01");
    d = addDays(d, -1), i++
  ) {
    if (!dueOn(h, d, end)) continue;
    if (checked(s, h, d)) n++;
    else if (d !== end) break;
  }
  return n;
}
export function toggleDebtPayment(finance, id, today = isoDate()) {
  const debt = finance.debts.find((d) => String(d.id) === String(id));
  if (!debt) return;
  finance.payments ||= [];
  const period = (validDate(debt.dueDate) ? debt.dueDate : today).slice(0, 7);
  const existing = finance.payments.find(
    (p) => p.debtId === String(id) && p.period === period && !p.voidedAt,
  );
  if (existing) {
    existing.voidedAt = new Date().toISOString();
    debt.totalBalance =
      Math.round((numberIn(debt.totalBalance) + existing.amount) * 100) / 100;
    debt.paidPeriod = null;
    debt.paidThisMonth = false;
    return;
  }
  if (debt.paidThisMonth && debt.paidPeriod === period)
    throw new Error(
      "Este pago viene de la versión anterior. Registra un ajuste de saldo antes de anularlo; no conocemos el importe original aplicado.",
    );
  const amount = Math.min(
    numberIn(debt.minPayment),
    numberIn(debt.totalBalance),
  );
  if (!amount) throw new Error("No hay saldo pendiente para este pago.");
  finance.payments.push({
    id: newId(),
    debtId: String(id),
    period,
    amount,
    date: today,
    voidedAt: null,
  });
  debt.totalBalance =
    Math.round((numberIn(debt.totalBalance) - amount) * 100) / 100;
  debt.paidPeriod = period;
  debt.paidThisMonth = true;
}
export function nextMonthlyDate(date) {
  const d = new Date(`${date}T12:00:00`);
  const wanted = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(
    Math.min(wanted, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
  );
  return isoDate(d);
}
export function cashFlow(finance, today = isoDate()) {
  const next = (finance.incomes || [])
    .filter((i) => validDate(i.nextDate) && i.nextDate > today)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  const horizon = next?.nextDate || addDays(today, 30);
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${horizon}T12:00:00`) - new Date(`${today}T12:00:00`)) /
        86400000,
    ),
  );
  const debts = (finance.debts || [])
    .filter((d) => !d.paidThisMonth && d.dueDate <= horizon)
    .reduce((n, d) => n + numberIn(d.minPayment), 0);
  const expenses = (finance.expenses || [])
    .filter((e) => !e.paid && (!e.dueDate || e.dueDate <= horizon))
    .reduce((n, e) => n + numberIn(e.amount), 0);
  const hasBalance =
    finance.availableBalance !== undefined &&
    finance.availableBalance !== null &&
    finance.availableBalance !== "";
  return {
    hasBalance,
    days,
    horizon,
    reserved: debts + expenses,
    available: hasBalance
      ? numberIn(finance.availableBalance) - debts - expenses
      : null,
    daily: hasBalance
      ? Math.max(
          0,
          Math.floor(
            (numberIn(finance.availableBalance) - debts - expenses) / days,
          ),
        )
      : null,
  };
}
export function validateSchedule(blocks) {
  const mins = (t) =>
    /^([01]\d|2[0-3]):[0-5]\d$/.test(t || "")
      ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
      : NaN;
  const sorted = [...blocks].sort(
    (a, b) => mins(a.startTime) - mins(b.startTime),
  );
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (
      !Number.isFinite(mins(b.startTime)) ||
      !Number.isFinite(mins(b.endTime)) ||
      mins(b.endTime) <= mins(b.startTime)
    )
      throw new Error("La agenda contiene una hora inválida.");
    if (i && mins(b.startTime) < mins(sorted[i - 1].endTime))
      throw new Error("La propuesta contiene horarios que se traslapan.");
  }
  return sorted;
}

/** One cloud document per logical entity, never one document for the entire user. */
export function toRecords(state) {
  const s = withoutSecrets(state),
    out = {};
  const put = (path, value, order = 0) => {
    if (value === undefined) return;
    out[JSON.stringify(path)] = { path, value: clone(value), order };
  };
  const list = (path, items) => {
    (items || []).forEach((item, i) =>
      put([...path, String(item.id)], item, i),
    );
  };
  for (const [k, v] of Object.entries(s))
    if (
      ![
        "days",
        "habitsList",
        "tasks",
        "groceries",
        "gymStructured",
        "finance",
        "workHub",
        "tutorData",
        "currentDay",
        "updatedAt",
        "schemaVersion",
      ].includes(k)
    )
      put([k], v);
  for (const key of ["habitsList", "tasks", "groceries"]) list([key], s[key]);
  for (const [date, d] of Object.entries(s.days || {})) {
    const {
      meals,
      impulses,
      habitsState,
      habitValues,
      water,
      waterModifiedAt,
      ...meta
    } = d;
    put(["days", date, "meta"], meta);
    put(["days", date, "water"], {
      water: d.water || 0,
      waterModifiedAt: d.waterModifiedAt || 0,
    });
    for (const key of ["meals", "impulses"]) list(["days", date, key], d[key]);
    for (const id of new Set([
      ...Object.keys(d.habitsState || {}),
      ...Object.keys(d.habitValues || {}),
    ]))
      put(["days", date, "habit", id], {
        checked: d.habitsState?.[id] === true,
        value: d.habitValues?.[id] || 0,
      });
  }
  for (const group of ["finance", "workHub"])
    for (const [k, v] of Object.entries(s[group] || {})) {
      if (
        [
          "incomes",
          "expenses",
          "debts",
          "payments",
          "scheduleBlocks",
          "inboxItems",
        ].includes(k)
      )
        list([group, k], v);
      else put([group, k], v);
    }
  for (const [date, gym] of Object.entries(s.gymStructured || {})) {
    put(["gymStructured", date, "focus"], gym.focus || "");
    list(["gymStructured", date, "exercises"], gym.exercises);
  }
  for (const [k, v] of Object.entries(s.tutorData || {}))
    if (k !== "subjectsMap" && k !== "lastLesson") put(["tutorData", k], v);
  for (const [key, subject] of Object.entries(s.tutorData?.subjectsMap || {})) {
    const { lessons, ...meta } = subject;
    put(["tutorData", "subjectsMap", key, "meta"], meta);
    list(["tutorData", "subjectsMap", key, "lessons"], lessons);
  }
  // Preserve the original single-subject lesson until the tutor migration has run.
  if (
    !Object.keys(s.tutorData?.subjectsMap || {}).length &&
    s.tutorData?.lastLesson
  )
    put(["tutorData", "lastLesson"], s.tutorData.lastLesson);
  return out;
}
export function fromRecords(records, defaults) {
  const s = clone(defaults);
  s.days = {};
  s.tasks = [];
  s.habitsList = [];
  s.groceries = [];
  s.gymStructured = {};
  s.tutorData.subjectsMap = {};
  for (const k of ["incomes", "expenses", "debts", "payments"])
    s.finance[k] = [];
  s.workHub.scheduleBlocks = [];
  s.workHub.inboxItems = [];
  const entries = Object.values(records)
    .filter((r) => !r.deleted)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const { path: p, value: v } of entries) {
    if (
      !Array.isArray(p) ||
      p.some((x) => ["__proto__", "constructor", "prototype"].includes(x))
    )
      continue;
    const value = clone(v);
    if (p[0] === "days") {
      const d = (s.days[p[1]] ||= emptyDay());
      if (p[2] === "water" || p[2] === "meta") Object.assign(d, value);
      else if (p[2] === "habit") {
        d.habitsState[p[3]] = value.checked;
        d.habitValues[p[3]] = value.value;
      } else (d[p[2]] ||= []).push(value);
    } else if (["habitsList", "tasks", "groceries"].includes(p[0]))
      s[p[0]].push(value);
    else if (p[0] === "gymStructured") {
      const g = (s.gymStructured[p[1]] ||= { focus: "", exercises: [] });
      if (p[2] === "focus") g.focus = value;
      else g.exercises.push(value);
    } else if (p[0] === "tutorData" && p[1] === "subjectsMap") {
      const sub = (s.tutorData.subjectsMap[p[2]] ||= { lessons: [] });
      if (p[3] === "meta") Object.assign(sub, value);
      else sub.lessons.push(value);
    } else if (p.length === 3 && (p[0] === "finance" || p[0] === "workHub"))
      (s[p[0]][p[1]] ||= []).push(value);
    else if (p.length === 2) (s[p[0]] ||= {})[p[1]] = value;
    else if (p.length === 1) s[p[0]] = value;
  }
  return s;
}
export function diffRecords(previous, next) {
  const result = {};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)]))
    if (
      JSON.stringify(previous[key]?.value) !==
        JSON.stringify(next[key]?.value) ||
      !!previous[key]?.deleted !== !!next[key]?.deleted
    )
      result[key] = next[key] || { path: previous[key].path, deleted: true };
  return result;
}

export function safeImageUrl(value) {
  const url = String(value || "");
  return /^(https:\/\/|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(url)
    ? url
    : "";
}

export const inlineArgument = (value) =>
  escapeHtml(JSON.stringify(String(value)));
