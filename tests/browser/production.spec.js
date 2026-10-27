import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
let server, url;
test.beforeAll(async () => {
  const dist = path.resolve("dist");
  server = http.createServer(async (req, res) => {
    try {
      const name =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        ).replace(/^\/demo\//, "") || "index.html";
      const target = path.resolve(dist, name);
      if (!target.startsWith(dist + path.sep)) throw Error("Invalid path");
      const content = await fs.readFile(target);
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
      };
      res.setHeader(
        "Content-Type",
        types[path.extname(target)] || "application/octet-stream",
      );
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}/demo/`;
});
test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});
test("compilado bajo subruta y PWA abre sin red", async ({ page, context }) => {
  await page.goto(url + "?local=1");
  await page.locator("#obName").fill("Prueba sin red");
  await page.getByRole("button", { name: "Empezar mi día" }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.evaluate(() => addWater(250));
  await expect(page.locator("#cloudStatusBadge")).toHaveText(
    "En este dispositivo",
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#todayGreeting")).toContainText("Prueba sin red");
  await expect(page.locator("#todayWater")).toHaveText("0.3 L");
  await context.setOffline(false);
});
