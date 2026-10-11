/* global document, KeyboardEvent */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";

// Run beside `npm run dev`. No extra browser globals are added to the game.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route("**/__capture__", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0"><canvas id="capture" style="width:1280px;height:720px;display:block"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/__capture__");
const captured = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const C = await import("/src/constants.ts");
  const canvas = document.getElementById("capture");
  const engine = createEngine({
    canvas,
    width: C.STAGE_W,
    height: C.STAGE_H,
    layout: C.LAYOUT,
    background: BACKGROUND,
    game,
    clock: { delta: () => 0 },
  });
  await engine.initialize();
  await engine.advance(1);
  const title = canvas.toDataURL();
  const key = (code) => {
    document.dispatchEvent(new KeyboardEvent("keydown", { code }));
    document.dispatchEvent(new KeyboardEvent("keyup", { code }));
  };
  key("Enter");
  await engine.advance(1);
  const d = engine.debug;
  // Arrange a mid-round chain, then capture genuine ticks, steering and scoring.
  const chain = [];
  for (let col = 20; col >= 8; col--) chain.push({ col, row: 5 });
  for (let row = 6; row <= 11; row++) chain.push({ col: 8, row });
  for (let col = 9; col <= 17; col++) chain.push({ col, row: 11 });
  engine.apply((s) => d.setSnake(s, chain));
  engine.apply((s) => d.setScore(s, 120));
  engine.apply((s) => d.setPellet(s, 24, 5));
  const pellets = [
    { col: 24, row: 9 },
    { col: 20, row: 13 },
    { col: 14, row: 13 },
    { col: 12, row: 9 },
    { col: 16, row: 8 },
    { col: 20, row: 8 },
  ];
  let next = 0;
  engine.apply((s) => d.setNextPellet(s, pellets[0].col, pellets[0].row));
  engine.setClock(new ConstantClock(1000 / 24));
  engine.startRecording();
  let board = "";
  for (let frame = 0; frame < 144; frame++) {
    const s = engine.state,
      h = s.snake[0];
    if (h.col === 24 && h.row === 5 && s.dir === "right") key("ArrowDown");
    if (h.col === 24 && h.row === 13 && s.dir === "down") key("ArrowLeft");
    if (h.col === 12 && h.row === 13 && s.dir === "left") key("ArrowUp");
    if (h.col === 12 && h.row === 8 && s.dir === "up") key("ArrowRight");
    if (h.col === 22 && h.row === 8 && s.dir === "right") key("ArrowUp");
    if (h.col === 22 && h.row === 3 && s.dir === "up") key("ArrowLeft");
    await engine.advance(1);
    if (engine.state.nextPellet === null && next < pellets.length - 1) {
      next++;
      engine.apply((s) =>
        d.setNextPellet(s, pellets[next].col, pellets[next].row),
      );
    }
    if (frame === 88) board = canvas.toDataURL();
    if (engine.state.screen !== "playing")
      throw new Error(
        "Showcase route collided: " + JSON.stringify(d.snapshot(engine.state)),
      );
  }
  const replay = engine.stopRecording();
  if (!replay.images.length)
    throw new Error("Replay did not capture the produced sprites");
  engine.destroy();
  return { title, board, replay };
});
await mkdir("showcase", { recursive: true });
for (const name of ["title", "board"])
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(captured[name].split(",")[1], "base64"),
  );
await writeFile(
  "showcase/combo.json.gz",
  gzipSync(JSON.stringify(captured.replay)),
);
await browser.close();
