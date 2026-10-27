import { test, expect } from "@playwright/test";
async function boot(page) {
  await page.goto("/?local=1");
  await page.locator("#obName").fill("Alex");
  await page.getByRole("button", { name: "Empezar mi día" }).click();
  await expect(page.locator("#onboardingModal")).toBeHidden();
}
async function act(page, name, ...args) {
  return page.evaluate(([n, a]) => window[n](...a), [name, args]);
}
async function tab(page, n) {
  await act(page, "switchTab", n);
}
test("navegación, móvil, escritorio y temas sin errores", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await boot(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(350);
    for (const n of [
      "today",
      "habits",
      "nutrition",
      "focus",
      "finance",
      "tutor",
      "gym",
      "grocery",
      "settings",
    ]) {
      await tab(page, n);
      await expect(page.locator("#tab-" + n)).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }
  await tab(page, "today");
  await expect(page.locator("#sidebarDrawer")).toHaveClass(/-translate-x-full/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await act(page, "toggleTheme");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/tcc-mobile-light.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/tcc-desktop-light.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("hábitos, contador, deshacer, persistencia y XSS", async ({ page }) => {
  await boot(page);
  await tab(page, "habits");
  await page
    .locator("#newHabitInput")
    .fill("Leer <img src=x onerror=alert(1)>");
  await page.locator("#habitTarget").fill("2");
  await act(page, "addHabit");
  await act(page, "adjustHabitValue", 0, 1);
  expect(
    await page.evaluate(
      () =>
        appState.days[appState.currentDay].habitValues[
          appState.habitsList[0].id
        ],
    ),
  ).toBe(1);
  await act(page, "adjustHabitValue", 0, 1);
  await expect(page.locator("#habitsDoneSummaryTitle")).toContainText("1 de 1");
  await act(page, "undoLastChange");
  await expect(page.locator("#habitsDoneSummaryTitle")).toContainText("0 de 1");
  expect(await page.locator("#habitsList img").count()).toBe(0);
  await page.reload();
  await expect(page.locator("#newHabitInput")).toBeVisible();
  expect(await page.evaluate(() => appState.habitsList.length)).toBe(1);
});
test("comida cero, fecha capturada y confirmación cancelable", async ({
  page,
}) => {
  await boot(page);
  await tab(page, "nutrition");
  const origin = await page.evaluate(() => appState.currentDay);
  await page.locator("#aiFoodInput").fill("Agua natural 0 kcal");
  await page.locator("#aiFoodBtn").click();
  await expect(page.locator("#reviewDialog")).toBeVisible();
  await act(page, "selectDay", "2026-10-01");
  await page
    .getByRole("button", { name: "Aceptar y aplicar", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate((d) => appState.days[d].meals[0]?.kcal, origin))
    .toBe(0);
  expect(
    await page.evaluate(() => appState.days[appState.currentDay].meals.length),
  ).toBe(0);
  await page.locator("#aiFoodInput").fill("Otro alimento 30 kcal");
  await page.locator("#aiFoodBtn").click();
  await page.locator("#reviewDialog button[value=cancel]").click();
  expect(
    await page.evaluate(() => appState.days[appState.currentDay].meals.length),
  ).toBe(0);
});
test("UUID en finanzas y agenda; pago reversible", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const { runtime, actions } = await import("/src/core/context.js");
    runtime.appState.finance.debts = [
      {
        id: "debt-uuid",
        name: "Tarjeta",
        totalBalance: 1000,
        minPayment: 100,
        dueDate: runtime.appState.currentDay,
      },
    ];
    runtime.appState.workHub.scheduleBlocks = [
      {
        id: "block-uuid",
        date: runtime.appState.currentDay,
        title: "Revisar reporte",
        startTime: "09:00",
        endTime: "10:00",
        type: "task",
        code: "T-1",
        done: false,
      },
    ];
    await actions.saveState();
  });
  await tab(page, "finance");
  await act(page, "switchFinanceSubTab", "debts");
  await page.locator('[onclick*="toggleFinanceDebtPaid"]').click();
  expect(
    await page.evaluate(() => appState.finance.debts[0].totalBalance),
  ).toBe(900);
  await page.locator('[onclick*="toggleFinanceDebtPaid"]').click();
  expect(
    await page.evaluate(() => appState.finance.debts[0].totalBalance),
  ).toBe(1000);
  await page.locator('[onclick*="toggleFinanceDebtPaid"]').click();
  expect(
    await page.evaluate(() => appState.finance.debts[0].totalBalance),
  ).toBe(900);
  await tab(page, "focus");
  await act(page, "switchFocusSubTab", "agenda");
  await page.locator('[onchange*="toggleScheduleBlockDone"]').check();
  expect(
    await page.evaluate(() => appState.workHub.scheduleBlocks[0].done),
  ).toBe(true);
});
test("respaldo portable sin claves privadas, gimnasio y despensa", async ({
  page,
}) => {
  await boot(page);
  await tab(page, "gym");
  await act(page, "toggleNewExerciseForm");
  await page.locator("#manualExerciseName").fill("Sentadilla");
  await act(page, "addGymExercise");
  await act(page, "toggleGymEx", 0);
  await tab(page, "grocery");
  await page.locator("#manualGroceryInput").fill("Avena");
  await act(page, "addManualGrocery");
  await page.evaluate(() => {
    appState.apiKey = "PRIVATE-TEST";
    appState.workHub.greenApiToken = "PRIVATE-TEST";
  });
  const downloadPromise = page.waitForEvent("download");
  await act(page, "exportBackupJSON");
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  let output = "";
  for await (const c of stream) output += c;
  expect(output).not.toContain("PRIVATE-TEST");
  const data = JSON.parse(output);
  expect(data.firebaseConfig.projectId).toBe("control-tcc");
  expect(data.state.groceries[0].text).toBe("Avena");
  expect(
    data.state.gymStructured[data.state.currentDay].exercises[0].done,
  ).toBe(true);
});
