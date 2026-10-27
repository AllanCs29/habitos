import { migrateState, toRecords } from "./domain.js";

/** Prefer the current legacy document; an older backup must not revive deletions. */
export function readLegacyDocument(data, defaults) {
  if (!data?.stateJson && !data?.backupStateJson) return null;
  let lastError;
  for (const field of ["stateJson", "backupStateJson"]) {
    if (!data[field]) continue;
    try {
      const raw =
        typeof data[field] === "string" ? JSON.parse(data[field]) : data[field];
      if (!raw || !(raw.days || raw.habitsList || raw.tasks || raw.profile))
        throw new Error(
          "El historial anterior no tiene un formato reconocido.",
        );
      return { state: migrateState(raw, defaults), source: field };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    "No se pudo leer el historial anterior. Conserva el documento original y recupera un respaldo JSON. " +
      lastError.message,
  );
}

export function recoveryCounts(state) {
  return `${state.habitsList.length} hábitos, ${state.tasks.length} tareas y ${Object.values(state.days).reduce((n, d) => n + (d.meals?.length || 0), 0)} comidas`;
}

/** Merge missing records, including tombstones so intentional deletions stay deleted. */
export function recoveryRecords(incoming, current, knownRecords) {
  const old = toRecords(incoming),
    now = toRecords(current);
  const deleted = Object.fromEntries(
    Object.entries(knownRecords).filter(([, r]) => r.deleted),
  );
  const result = { ...old, ...now, ...deleted };
  // A freshly created account has a blank profile. Fill only its empty fields.
  const key = JSON.stringify(["profile"]);
  if (old[key] && now[key] && !deleted[key]) {
    const profile = { ...now[key].value };
    for (const [name, value] of Object.entries(old[key].value)) {
      if (profile[name] === "" || profile[name] == null) profile[name] = value;
    }
    result[key] = { ...now[key], value: profile };
  }
  return result;
}
