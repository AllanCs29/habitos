import test from "node:test";
import assert from "node:assert/strict";
import { readLegacyDocument, recoveryRecords } from "../src/core/recovery.js";
import { createDefaultState } from "../src/features/model.js";
import { migrateState, fromRecords } from "../src/core/domain.js";
const make = (raw) => migrateState(raw, createDefaultState());

test("un historial actual vacío prevalece sobre el respaldo antiguo", () => {
  const data = {
    stateJson: JSON.stringify({ days: {}, habitsList: [] }),
    backupStateJson: JSON.stringify({
      habitsList: [{ id: "deleted", name: "Eliminado" }],
    }),
  };
  const result = readLegacyDocument(data, createDefaultState());
  assert.equal(result.source, "stateJson");
  assert.equal(result.state.habitsList.length, 0);
});
test("si el JSON principal está corrupto se puede leer el respaldo intacto", () => {
  const result = readLegacyDocument(
    {
      stateJson: "{invalid",
      backupStateJson: JSON.stringify({
        tasks: [{ id: 7, text: "Conservar" }],
      }),
    },
    createDefaultState(),
  );
  assert.equal(result.source, "backupStateJson");
  assert.equal(result.state.tasks[0].text, "Conservar");
});
test("un documento corrupto no se transforma silenciosamente en una cuenta vacía", () => {
  assert.throws(() =>
    readLegacyDocument(
      { stateJson: "{", backupStateJson: "[]" },
      createDefaultState(),
    ),
  );
  assert.equal(readLegacyDocument(null, createDefaultState()), null);
});
test("la recuperación completa el perfil vacío, conserva ceros y respeta tombstones", () => {
  const old = make({
    profile: { name: "Nombre anterior", weight: 77 },
    habitsList: [{ id: "deleted", name: "Eliminado" }],
    days: { "2025-01-01": { meals: [{ id: "meal", kcal: 0 }] } },
  });
  const current = make({ profile: { name: "Nombre actual", weight: "" } });
  const known = {
    '["habitsList","deleted"]': {
      path: ["habitsList", "deleted"],
      deleted: true,
    },
  };
  const result = fromRecords(
    recoveryRecords(old, current, known),
    createDefaultState(),
  );
  assert.equal(result.profile.name, "Nombre actual");
  assert.equal(result.profile.weight, 77);
  assert.equal(result.habitsList.length, 0);
  assert.equal(result.days["2025-01-01"].meals[0].kcal, 0);
});
