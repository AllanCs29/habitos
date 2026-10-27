import { test, expect } from "@playwright/test";

async function boot(page) {
  await page.goto("/?local=1");
  await page.waitForFunction(
    () => typeof window.handleAuthStateChanged === "function",
  );
  await page.evaluate(() => window.dismissOnboardingModal());
}

async function connect(page, options = {}) {
  await page.evaluate(async (options) => {
    const { runtime, actions } = await import("/src/core/context.js");
    const { migrateState, toRecords } = await import("/src/core/domain.js");
    const uid = "account-a";
    const legacy = {
      ...actions.createDefaultState(),
      onboardingComplete: true,
      profile: {
        name: "Historial original",
        weight: 73,
        medicalCondition: "Prueba",
      },
      habitsList: [
        {
          id: "legacy-habit",
          name: "Leer antes de dormir",
          createdAt: "2025-01-01",
        },
      ],
      tasks: [{ id: "legacy-task", text: "Tarea anterior", done: false }],
      days: {
        "2025-01-03": {
          water: 1500,
          meals: [{ id: "legacy-meal", name: "Avena", kcal: 350 }],
          habitsState: { "legacy-habit": true },
        },
      },
      finance: {
        debts: [
          {
            id: "legacy-debt",
            name: "Tarjeta",
            totalBalance: 1234,
            minPayment: 100,
            dueDate: "2026-11-01",
          },
        ],
      },
    };
    const previousBackup = {
      ...legacy,
      tasks: [{ id: "outdated", text: "Respaldo antiguo" }],
    };
    const existing = options.existing
      ? toRecords(
          migrateState(
            {
              ...actions.createDefaultState(),
              onboardingComplete: true,
              tasks: [{ id: "legacy-task", text: "Edición reciente" }],
            },
            actions.createDefaultState(),
          ),
        )
      : {};
    if (options.tombstone)
      existing['["habitsList","legacy-habit"]'] = {
        path: ["habitsList", "legacy-habit"],
        deleted: true,
        opId: "deleted-on-purpose",
      };
    const state = (window.cloudTest = {
      denyV2: !!options.denyV2,
      denyLegacy: !!options.denyLegacy,
      original: JSON.stringify(legacy),
      records: existing,
      commits: 0,
      parentWrites: 0,
      reads: [],
      listener: null,
    });
    const denied = () =>
      Object.assign(new Error("Missing or insufficient permissions"), {
        code: "permission-denied",
      });
    const snapshot = () => ({
      empty: !Object.keys(state.records).length,
      metadata: { fromCache: false, hasPendingWrites: false },
      docs: Object.entries(state.records).map(([key, r]) => ({
        data: () => ({ ...r, key }),
      })),
    });
    const records = {
      get: async (opts) => {
        state.reads.push(["records", opts.source]);
        if (state.denyV2) throw denied();
        return snapshot();
      },
      doc: (id) => ({ id }),
      onSnapshot: (_opts, next) => {
        state.listener = next;
        next(snapshot());
        return () => {
          if (state.listener === next) state.listener = null;
        };
      },
    };
    runtime.fbDb = {
      collection: (path) => {
        if (path !== "tcc_users") throw Error("Wrong collection");
        return {
          doc: (id) => ({
            get: async (opts) => {
              state.reads.push(["legacy", opts.source, id]);
              if (state.denyLegacy) throw denied();
              if (id !== uid) return { exists: false };
              return {
                exists: true,
                data: () => ({
                  stateJson: state.original,
                  backupStateJson: JSON.stringify(previousBackup),
                }),
              };
            },
            set: () => {
              state.parentWrites++;
              throw Error("Must preserve original");
            },
            collection: (name) => {
              if (name !== "v2_records") throw Error("Wrong collection");
              return records;
            },
          }),
        };
      },
      batch: () => {
        const writes = [];
        return {
          set: (_ref, data) => writes.push(data),
          commit: async () => {
            if (state.denyV2) throw denied();
            state.commits++;
            for (const r of writes) state.records[r.key] = r;
            state.listener?.(snapshot());
          },
        };
      },
    };
    await window.handleAuthStateChanged({
      uid,
      email: "historial@example.test",
    });
  }, options);
}

test("el historial anterior se muestra con permisos v2 pendientes y migra al reintentar", async ({
  page,
}) => {
  await boot(page);
  await connect(page, { denyV2: true });
  expect(await page.evaluate(() => appState.habitsList[0].name)).toBe(
    "Leer antes de dormir",
  );
  expect(
    await page.evaluate(() => appState.days["2025-01-03"].meals[0].kcal),
  ).toBe(350);
  expect(
    await page.evaluate(() => appState.finance.debts[0].totalBalance),
  ).toBe(1234);
  await page.evaluate(() => switchTab("settings"));
  await expect(page.locator("#syncNotice")).toContainText("firestore.rules");
  await expect(page.locator("#firebaseAuthStatus")).toHaveText(
    "Historial recuperado · falta sincronizar",
  );
  expect(await page.evaluate(() => cloudTest.commits)).toBe(0);
  await page.evaluate(async () => {
    appState.tasks.push({ id: "new-local", text: "Cambio sin permisos" });
    await saveState();
    await pushStateToCloud();
  });
  expect(await page.evaluate(() => cloudTest.commits)).toBe(0);
  await page.evaluate(async () => {
    cloudTest.denyV2 = false;
    await forceCloudSyncNow();
  });
  await expect(page.locator("#firebaseAuthStatus")).toHaveText("Sincronizado");
  expect(
    await page.evaluate(
      () => cloudTest.records['["tasks","new-local"]'].value.text,
    ),
  ).toBe("Cambio sin permisos");
  expect(
    await page.evaluate(
      () =>
        cloudTest.records['["days","2025-01-03","meals","legacy-meal"]'].value
          .kcal,
    ),
  ).toBe(350);
  expect(await page.evaluate(() => cloudTest.parentWrites)).toBe(0);
  expect(
    await page.evaluate(() => JSON.parse(cloudTest.original).tasks.length),
  ).toBe(1);
  expect(
    await page.evaluate(() => cloudTest.reads.every((r) => r[1] === "server")),
  ).toBe(true);
});

test("recuperar con v2 existente usa stateJson y respeta ediciones y borrados", async ({
  page,
}) => {
  await boot(page);
  await connect(page, { existing: true, tombstone: true });
  expect(await page.evaluate(() => appState.habitsList.length)).toBe(0);
  await page.evaluate(() => switchTab("settings"));
  await expect(page.locator("#legacyRecoveryNotice")).toBeVisible();
  await page.evaluate(() => {
    window.recoveryDone = restoreFromCloudBackup();
  });
  await expect(page.locator("#reviewDialog")).toBeVisible();
  await page.locator("#reviewDialog button[value=accept]").click();
  await page.evaluate(() => window.recoveryDone);
  expect(await page.evaluate(() => appState.profile.name)).toBe(
    "Historial original",
  );
  expect(await page.evaluate(() => appState.tasks.map((t) => t.text))).toEqual([
    "Edición reciente",
  ]);
  expect(await page.evaluate(() => appState.habitsList.length)).toBe(0);
  expect(
    await page.evaluate(() => appState.days["2025-01-03"].meals[0].kcal),
  ).toBe(350);
  expect(
    await page.evaluate(() => appState.tasks.some((t) => t.id === "outdated")),
  ).toBe(false);
});

test("una lectura anterior fallida nunca autoriza crear una cuenta vacía", async ({
  page,
}) => {
  await boot(page);
  await connect(page, { denyLegacy: true });
  await page.evaluate(() => forceCloudSyncNow());
  expect(await page.evaluate(() => cloudTest.commits)).toBe(0);
  await expect(page.locator("#cloudStatusBadge")).not.toHaveText(
    "Sincronizado",
  );
  expect(
    await page.evaluate(
      async () =>
        (await import("/src/core/context.js")).runtime.isCloudHydrated,
    ),
  ).toBe(false);
});

test("los cambios pendientes se reenvían al volver a entrar en una cuenta existente", async ({
  page,
}) => {
  await boot(page);
  await connect(page, { existing: true });
  await page.evaluate(async () => {
    cloudTest.denyV2 = true;
    appState.tasks.push({ id: "offline-task", text: "Pendiente al salir" });
    await saveState();
    await pushStateToCloud();
    await handleAuthStateChanged(null);
    cloudTest.denyV2 = false;
    await handleAuthStateChanged({
      uid: "account-a",
      email: "historial@example.test",
    });
  });
  await expect(page.locator("#cloudStatusBadge")).toHaveText("Sincronizado");
  expect(
    await page.evaluate(
      () => cloudTest.records['["tasks","offline-task"]'].value.text,
    ),
  ).toBe("Pendiente al salir");
  expect(
    await page.evaluate(() =>
      appState.tasks.some((t) => t.id === "offline-task"),
    ),
  ).toBe(true);
});

test("cambiar de cuenta durante la lectura no carga el historial de otra persona", async ({
  page,
}) => {
  await boot(page);
  await connect(page, { denyV2: true });
  await page.evaluate(async () => {
    await handleAuthStateChanged(null);
    const { runtime } = await import("/src/core/context.js");
    const original = runtime.fbDb.collection;
    runtime.fbDb.collection = (path) => {
      const c = original(path);
      return {
        doc: (uid) => {
          const ref = c.doc(uid);
          if (uid === "account-a")
            return {
              ...ref,
              get: (...args) =>
                new Promise((resolve) => {
                  window.releaseFirstAccount = async () =>
                    resolve(await ref.get(...args));
                }),
            };
          return ref;
        },
      };
    };
    window.firstAccount = handleAuthStateChanged({
      uid: "account-a",
      email: "a@example.test",
    });
  });
  await page.waitForFunction(() => !!window.releaseFirstAccount);
  await page.evaluate(async () => {
    await handleAuthStateChanged({ uid: "account-b", email: "b@example.test" });
    await releaseFirstAccount();
    await firstAccount;
  });
  expect(await page.evaluate(() => appState.habitsList.length)).toBe(0);
  expect(await page.evaluate(() => appState.profile.name)).not.toBe(
    "Historial original",
  );
  await page.evaluate(() => switchTab("settings"));
  await expect(page.locator("#authUserEmail")).toHaveText("b@example.test");
});
