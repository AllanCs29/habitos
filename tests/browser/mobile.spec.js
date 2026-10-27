import { test, expect } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test("pantallas pequeñas, datos largos, campos y navegación permanecen dentro del ancho", async ({
  page,
}) => {
  await page.goto("/?local=1");
  await page.locator("#obName").fill("Nombre de prueba largo");
  await page.getByRole("button", { name: "Empezar mi día" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(async () => {
    const { runtime } = await import("/src/core/context.js");
    const long = "RegistroPersonal".repeat(12);
    appState.habitsList = [
      { id: "long-habit", name: long, createdAt: appState.currentDay },
    ];
    appState.tasks = [
      {
        id: "long-task",
        text: long,
        done: false,
        project: "PRUEBA",
        solicita: "Persona de prueba",
        time: "12:30",
      },
    ];
    appState.groceries = [{ id: "long-grocery", text: long, done: false }];
    appState.gymStructured[appState.currentDay] = {
      focus: long,
      exercises: [
        { id: "long-exercise", name: long, sets: 3, reps: 12, done: false },
      ],
    };
    appState.days[appState.currentDay].meals = [
      { id: "long-meal", name: long, kcal: 350, p: 20, c: 20, f: 10 },
    ];
    await saveState();
    runtime.persistenceStatus = "pending";
    renderAll();
  });
  for (const width of [320, 360, 375, 390, 430, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    for (const tab of [
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
      await page.evaluate((t) => switchTab(t), tab);
      const sizes = await page.evaluate(() => ({
        layout: innerWidth,
        scroll: document.documentElement.scrollWidth,
        visual: visualViewport.width,
      }));
      expect(sizes.layout, `${width}px ${tab} layout`).toBe(width);
      expect(sizes.scroll, `${width}px ${tab} scroll`).toBeLessThanOrEqual(
        width,
      );
      expect(
        Math.round(sizes.visual),
        `${width}px ${tab} visual viewport`,
      ).toBe(width);
      const outside = await page.evaluate(
        (width) =>
          [
            ...document.querySelectorAll(
              ".workspace button, .workspace input, .workspace select, .workspace textarea, .mobile-nav button",
            ),
          ]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height || !el.getClientRects().length)
                return false;
              for (
                let parent = el.parentElement;
                parent && parent !== document.body;
                parent = parent.parentElement
              )
                if (
                  ["auto", "scroll", "hidden"].includes(
                    getComputedStyle(parent).overflowX,
                  )
                )
                  return false;
              return r.right > width + 1 || r.left < -1;
            })
            .map((el) => el.id || el.textContent.slice(0, 40)),
        width,
      );
      expect(outside, `${width}px ${tab} controles recortados`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => switchTab("settings"));
  const fields = await page
    .locator(
      "#tab-settings input:visible, #tab-settings select:visible, #tab-settings textarea:visible",
    )
    .evaluateAll((fields) =>
      fields.map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
  expect(fields.length).toBeGreaterThan(0);
  expect(fields.every((size) => size >= 16)).toBe(true);
  await page.evaluate(() => switchTab("today"));
  await page.screenshot({ path: "/tmp/tcc-201-mobile.png", fullPage: true });
  await page.locator("#menuButton").click();
  await expect(page.locator("#sidebarOverlay")).toBeVisible();
  await page.locator("#side-gym").click();
  await expect(page.locator("#sidebarOverlay")).toBeHidden();
  await expect(page.locator("#tab-gym")).toBeVisible();
  await page.screenshot({ path: "/tmp/tcc-201-gym.png", fullPage: true });
  const scroll = await page.evaluate(() => {
    window.scrollTo({ left: 300, top: 400, behavior: "instant" });
    return { x: scrollX, y: scrollY };
  });
  expect(scroll.x).toBe(0);
  expect(scroll.y).toBeGreaterThan(0);
});

test("el código ancho puede desplazarse dentro de su panel sin mover la pantalla", async ({
  page,
}) => {
  await page.goto("/?local=1");
  await page.locator("#obName").fill("Prueba código");
  await page.getByRole("button", { name: "Empezar mi día" }).click();
  await page.evaluate(() => {
    switchTab("tutor");
    const pre = document.createElement("pre");
    pre.id = "wide-code-test";
    pre.textContent = "console.log('Texto largo'); ".repeat(70);
    document.getElementById("tab-tutor").append(pre);
    pre.scrollLeft = 200;
  });
  expect(
    await page.locator("#wide-code-test").evaluate((el) => el.scrollLeft),
  ).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
