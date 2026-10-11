/* global document */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import process from "node:process";

// Serve the identical production tree at root and beneath a directory.
const root = resolve("dist");
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname.replace(
    /^\/nested\/coil\//,
    "/",
  );
  const path = resolve(
    root,
    "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
  );
  if (!path.startsWith(root + "/")) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".wav": "audio/wav",
      }[extname(path)] ?? "application/octet-stream",
    );
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(4174, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const mount of ["/", "/nested/coil/"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    const loaded = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(response.url());
      if (/\.(wav|png)$/.test(response.url())) loaded.push(response.url());
    });
    await page.goto("http://127.0.0.1:4174" + mount);
    await page.waitForFunction(
      () => document.querySelector("canvas").width === 1280,
    );
    await page.waitForTimeout(250);
    assert.equal(loaded.length, 11);
    assert.equal(errors.length, 0);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(160);
    await page.keyboard.press("KeyP");
    await page.waitForTimeout(80);
    const paused = await page.screenshot();
    await page.waitForTimeout(300);
    assert.deepEqual(
      await page.screenshot(),
      paused,
      "Pause must freeze the visual frame",
    );
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(50);
    assert.notDeepEqual(
      await page.screenshot(),
      paused,
      "Mute indicator must change immediately",
    );
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(50);
    assert.deepEqual(
      await page.screenshot(),
      paused,
      "Mute changes only sound state",
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(180);
    assert.notDeepEqual(await page.screenshot(), paused);
    await page.keyboard.press("KeyP");
    await page.waitForTimeout(30);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(50);
    await page.mouse.click(350, 528);
    await page.waitForTimeout(50);
    await page.screenshot({ path: "/tmp/coil-howto.png" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(50);
    await page.setViewportSize({ width: 780, height: 1000 });
    await page.waitForFunction(() => {
      const c = document.querySelector("canvas");
      return c.width === 780 && c.height === 1000;
    });
    await page.waitForTimeout(50);
    await page.screenshot({ path: "/tmp/coil-portrait.png" });
    await page.touchscreen.tap(400, 300);
    await page.waitForTimeout(50);
    assert.equal(
      await page.locator('[data-touch-controls="dpad-4"]').isVisible(),
      true,
    );
    await page.keyboard.press("KeyM");
    await page.waitForTimeout(50);
    assert.equal(
      await page.locator('[data-touch-controls="dpad-4"]').isVisible(),
      false,
    );
    assert.deepEqual(errors, []);
    await context.close();
    process.stdout.write(
      `Verified production at ${mount}: assets, pause, mute, navigation, fit and touch.\n`,
    );
  }
} finally {
  await browser.close();
  server.close();
}
