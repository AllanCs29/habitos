import { test, expect } from "@playwright/test";
async function boot(page) {
  await page.goto("/?local=1");
  await page.locator("#obName").fill("Alex");
  await page.getByRole("button", { name: "Empezar mi día" }).click();
}
async function act(page, name, ...args) {
  return page.evaluate(([n, a]) => window[n](...a), [name, args]);
}
test("carga el respaldo v1 sin destruir el original", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "allan_tcc_master_permanent_store",
      JSON.stringify({
        onboardingComplete: true,
        profile: { name: "Perfil anterior" },
        currentDay: "2026-09-10",
        apiKey: "PRIVATE-LEGACY",
        days: {
          "2026-09-10": {
            water: 1250,
            meals: [{ name: "Comida anterior", kcal: 350 }],
            habitsState: { leer: true },
          },
        },
        habitsList: [{ id: "leer", name: "Leer" }],
        tasks: [{ id: 7, text: "Reporte anterior" }],
        tutorData: {
          subject: "Python",
          lastLesson: {
            lessonTitle: "Lección guardada",
            explanation: "Contenido",
            quizOptions: ["a", "b", "c", "d"],
            correctOptionIndex: 0,
          },
        },
      }),
    ),
  );
  await page.goto("/?local=1");
  await expect(page.locator("#onboardingModal")).toBeHidden();
  await expect(page.locator("#todayGreeting")).toContainText("Perfil anterior");
  expect(await page.evaluate(() => appState.days["2026-09-10"].water)).toBe(
    1250,
  );
  expect(await page.evaluate(() => appState.apiKey)).toBeUndefined();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("allan_tcc_master_permanent_store"))
          .apiKey,
    ),
  ).toBe("PRIVATE-LEGACY");
  await act(page, "switchTab", "tutor");
  await act(page, "saveState");
  expect(
    await page.evaluate(
      () =>
        Object.values(appState.tutorData.subjectsMap)[0].lessons[0].lessonTitle,
    ),
  ).toBe("Lección guardada");
});
test("IA simulada: resultado tardío usa fecha inicial y cancelación descarta respuesta", async ({
  page,
}) => {
  await boot(page);
  await act(page, "switchTab", "nutrition");
  await page.evaluate(async () => {
    const { runtime } = await import("/src/core/context.js");
    runtime.fbUser = { uid: "test-local" };
    runtime.fbFunctions = {
      httpsCallable: () => () =>
        new Promise((resolve) => {
          window.completeMockAI = () =>
            resolve({
              data: {
                result: { name: "Avena", kcal: 180, p: 6, c: 30, f: 3 },
                model: "gemini-3.8-flash",
              },
            });
        }),
    };
  });
  const original = await page.evaluate(() => appState.currentDay);
  await page.locator("#aiFoodInput").fill("Avena");
  await page.locator("#aiFoodBtn").click();
  await expect(page.locator("#aiActivity")).toBeVisible();
  await act(page, "selectDay", "2026-10-02");
  await page.evaluate(() => window.completeMockAI());
  await expect(page.locator("#reviewDialog")).toBeVisible();
  await page.locator("#reviewDialog button[value=accept]").click();
  await expect
    .poll(() => page.evaluate((d) => appState.days[d].meals.length, original))
    .toBe(1);
  expect(
    await page.evaluate(() => appState.days["2026-10-02"].meals.length),
  ).toBe(0);
  await page.locator("#aiFoodInput").fill("Otra solicitud");
  await page.locator("#aiFoodBtn").click();
  await page.locator("#aiActivity button").click();
  await page.evaluate(() => window.completeMockAI());
  await expect(page.locator("#aiFoodBtn")).toBeEnabled();
  await expect(page.locator("#reviewDialog")).toBeHidden();
  expect(
    await page.evaluate(() => appState.days["2026-10-02"].meals.length),
  ).toBe(0);
});
test("PDF conserva texto y descarga un documento real", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { runtime, actions } = await import("/src/core/context.js");
    runtime.appState.tasks = [
      {
        id: "pdf-test",
        text: "Revisar reporte",
        project: "TEST-01",
        solicita: "Equipo",
        selectedForPdf: true,
        workFormat: {
          taskNumber: "TEST-01",
          activityDesc: "Revisar reporte",
          assignDate: "2026-10-26",
          dueDate: "2026-10-27",
          status: "En Progreso",
          notes: "Prueba de exportación",
          evidenceImages: [],
        },
      },
    ];
    await actions.saveState();
  });
  await act(page, "downloadOfficialTasksPDF");
  await expect(page.locator("#pdfPreviewModal")).toBeVisible();
  const download = page.waitForEvent("download");
  await act(page, "triggerDirectHtml2PdfDownload");
  const file = await download,
    stream = await file.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const bytes = Buffer.concat(chunks);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(bytes.length).toBeGreaterThan(1000);
});

test("integración captura credenciales antes de renderizar y no las persiste en estado", async ({
  page,
}) => {
  await boot(page);
  await act(page, "switchTab", "focus");
  await page.evaluate(async () => {
    const { runtime } = await import("/src/core/context.js");
    runtime.fbUser = { uid: "local-test" };
    runtime.fbFunctions = {
      httpsCallable: (name) => async (data) => {
        window.sentConfiguration = { name, data };
        return { data: { saved: true } };
      },
    };
    document.getElementById("greenApiIdInput").value = "1234567890";
    document.getElementById("greenApiTokenInput").value = "PRIVATE-TOKEN-TEST";
  });
  await act(page, "saveWorkContactSyncConfig");
  expect(
    await page.evaluate(() => window.sentConfiguration.data.greenApiToken),
  ).toBe("PRIVATE-TOKEN-TEST");
  expect(await page.evaluate(() => JSON.stringify(appState))).not.toContain(
    "PRIVATE-TOKEN-TEST",
  );
  expect(await page.locator("#greenApiTokenInput").inputValue()).toBe("");
});
