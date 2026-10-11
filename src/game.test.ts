/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type CoilState, type CoilDebugApi } from "./game";
import * as C from "./constants";

// Only the browser codecs are adapted. Assets, input, clock, simulation, drawing,
// cue events, diagnostics and the debug interface run through the real engine.
beforeAll(() => {
  vi.stubGlobal("ImageBitmap", Image);
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(await readFile(path)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      destination = {};
      async decodeAudioData(bytes: ArrayBuffer) {
        expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
        return { duration: (bytes.byteLength - 44) / 176400 };
      }
      async resume() {}
      createBufferSource() {
        return { connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {} }, connect() {} };
      }
    },
  );
});
const live: Engine<CoilState, CoilDebugApi>[] = [];
afterEach(() => {
  live.splice(0).forEach((e) => e.destroy());
});
async function setup(ms = 0) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: ms > 0 ? new ConstantClock(ms) : { delta: () => 0 },
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  live.push(engine);
  await engine.initialize();
  const d = engine.debug;
  const key = (code: string, type = "keydown") =>
    events.dispatchEvent(Object.assign(new Event(type), { code }));
  const press = async (code: string) => {
    key(code);
    key(code, "keyup");
    await engine.advance(1);
  };
  const step = async (seconds = C.TICK_SECONDS) => {
    engine.setClock(new ConstantClock(seconds * 1000));
    await engine.advance(1);
    engine.setClock({ delta: () => 0 });
  };
  const start = async () => {
    await press("Enter");
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    device = "mouse",
    id = 1,
  ) =>
    events.dispatchEvent(
      Object.assign(new Event("pointer" + type), {
        clientX: x,
        clientY: y,
        pointerType: device,
        pointerId: id,
        isPrimary: true,
        button: 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  return { engine, d, key, press, step, start, pointer, canvas };
}

describe("the fixed simulation", () => {
  it("opens with the complete versioned snapshot and real assets", async () => {
    const { engine, d } = await setup();
    expect(d.snapshot(engine.state)).toEqual({
      version: C.COIL_DEBUG_VERSION,
      screen: "title",
      menuIndex: 0,
      titleIndex: 0,
      mode: C.MODE,
      score: 0,
      best: 0,
      combo: 1,
      comboWindow: 0,
      muted: false,
      ticks: 0,
      simTime: 0,
      dir: C.START_DIR,
      turns: [],
      snake: C.START_CELLS,
      pellet: null,
      obstacles: [],
      steering: true,
      travel: true,
      pelletRespawn: true,
      nextPellet: null,
    });
    expect(Object.keys(engine.state.sprites)).toHaveLength(7);
    expect(engine.diagnostics().every((r) => r.error === undefined)).toBe(true);
  });
  it("accumulates partial ticks and resolves eight ticks in a second", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    engine.apply((s) => d.clearPellet(s));
    const before = engine.state;
    await step(0.06);
    expect(engine.state.snake).toEqual(before.snake);
    await step(0.94);
    expect(engine.state.ticks).toBe(8);
    expect(engine.state.snake[0]).toEqual({ col: 23, row: 8 });
    expect(before.snake).toEqual(C.START_CELLS);
    expect(engine.state.accumulator).toBeCloseTo(0);
  });
  it("buffers two turns and rejects overflow and reversal at the tick", async () => {
    const { engine, d, start, press, step } = await setup();
    await start();
    engine.apply((s) => d.clearPellet(s));
    await press("ArrowDown");
    await press("ArrowLeft");
    await press("ArrowUp");
    expect(engine.state.turns).toEqual(["down", "left"]);
    await step();
    expect(engine.state.dir).toBe("down");
    await step();
    expect(engine.state.dir).toBe("left");
    expect(engine.state.snake[0]).toEqual({ col: 14, row: 9 });
    await press("ArrowRight");
    await step();
    expect(engine.state.dir).toBe("left");
  });
  it("does not repeat held keys and consumes an invalid request alone", async () => {
    const { engine, start, key, press, step } = await setup();
    await start();
    key("ArrowRight");
    await engine.advance(3);
    await press("ArrowDown");
    expect(engine.state.turns).toEqual(["right", "down"]);
    await step();
    expect(engine.state.dir).toBe("right");
    await step();
    expect(engine.state.dir).toBe("down");
  });
  it("grows, scores immediately, raises best and plays the correct event cues", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply((s) => d.setPellet(s, 16, 8));
    engine.apply((s) => d.setNextPellet(s, 17, 8));
    await step();
    expect(engine.state.score).toBe(10);
    expect(engine.state.snake).toHaveLength(4);
    expect(engine.state.comboWindow).toBe(3.375);
    expect(engine.state.nextPellet).toBeNull();
    await step();
    expect(engine.state.score).toBe(30);
    expect(engine.state.best).toBe(30);
    expect(engine.state.combo).toBe(2);
    expect(cues).toEqual(["eat", "eat", "combo-up"]);
  });
  it("caps combos and lapses on the 28th tick including the eat", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    engine.apply((s) => d.setCombo(s, 5));
    engine.apply((s) => d.setComboWindow(s, 1));
    engine.apply((s) => d.setPellet(s, 16, 8));
    await step();
    expect(engine.state.score).toBe(50);
    engine.apply((s) => d.setSnakeTravel(s, false));
    await step(26 * C.TICK_SECONDS);
    expect(engine.state.combo).toBe(5);
    expect(engine.state.comboWindow).toBe(C.TICK_SECONDS);
    await step();
    expect(engine.state.combo).toBe(1);
    expect(engine.state.comboWindow).toBe(0);
  });
  it("distinguishes a last-open-tick eat from a closed-window eat", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    engine.apply((s) => d.setCombo(s, 3));
    engine.apply((s) => d.setComboWindow(s, C.TICK_SECONDS));
    engine.apply((s) => d.setPellet(s, 16, 8));
    await step();
    expect(engine.state.score).toBe(40);
    engine.apply((s) => d.setComboWindow(s, 0));
    engine.apply((s) => d.setPellet(s, 17, 8));
    await step();
    expect(engine.state.score).toBe(50);
    expect(engine.state.combo).toBe(1);
  });
  it("permits a vacating tail, but rejects an occupied body", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    engine.apply((s) => d.clearPellet(s));
    engine.apply((s) =>
      d.setSnake(s, [
        { col: 5, row: 5 },
        { col: 5, row: 6 },
        { col: 6, row: 6 },
        { col: 6, row: 5 },
      ]),
    );
    await step();
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.snake[0]).toEqual({ col: 6, row: 5 });
    engine.apply((s) => d.setDirection(s, "left"));
    await step();
    expect(engine.state.screen).toBe("gameover");
  });
  it("rejects the tail if a posed pellet makes it stay", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    engine.apply((s) => d.setPellet(s, 6, 5));
    engine.apply((s) =>
      d.setSnake(s, [
        { col: 5, row: 5 },
        { col: 5, row: 6 },
        { col: 6, row: 6 },
        { col: 6, row: 5 },
      ]),
    );
    await step();
    expect(engine.state.screen).toBe("gameover");
    expect(engine.state.score).toBe(0);
  });
  it("ends on a wall without moving and spends excess accumulated time", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    engine.apply((s) => d.setSnake(s, [{ col: 28, row: 8 }]));
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    await step(2);
    expect(engine.state.ticks).toBe(1);
    expect(engine.state.accumulator).toBe(0);
    expect(engine.state.snake[0].col).toBe(28);
    expect(cues).toEqual(["death"]);
    engine.apply((s) => d.setScreen(s, "playing"));
    engine.apply((s) => d.setDirection(s, "left"));
    await step(0.01);
    expect(engine.state.snake[0].col).toBe(28);
  });
  it("wins on the last valid cell and consumes a posed spawn", async () => {
    const { engine, d, start, step } = await setup();
    await start();
    const chain: C.Cell[] = [];
    for (let row = 1; row <= 16; row++)
      for (let i = 0; i < 28; i++)
        chain.push({ col: row % 2 ? i + 1 : 28 - i, row });
    engine.apply((s) => d.setSnake(s, chain.slice(1)));
    engine.apply((s) => d.setDirection(s, "left"));
    engine.apply((s) => d.setPellet(s, 1, 1));
    engine.apply((s) => d.setNextPellet(s, 0, 0));
    await step();
    expect(engine.state.screen).toBe("cleared");
    expect(engine.state.snake).toHaveLength(448);
    expect(engine.state.pellet).toBeNull();
    expect(engine.state.nextPellet).toBeNull();
    expect(d.drawPelletCell(engine.state)).toBeNull();
  });
});

describe("menus, audio and automation", () => {
  it("reconciles a posed score before starting a fresh round", async () => {
    const { engine, d, start } = await setup();
    engine.apply((s) => d.setBest(s, 10));
    engine.apply((s) => d.setScore(s, 120));
    await start();
    expect(engine.state.score).toBe(0);
    expect(engine.state.best).toBe(120);
  });

  it("remembers title selection, wraps menus and returns from instructions", async () => {
    const { engine, press } = await setup();
    await press("ArrowUp");
    expect(engine.state.menuIndex).toBe(1);
    await press("Space");
    expect(engine.state.screen).toBe("howto");
    await press("Escape");
    expect(engine.state.menuIndex).toBe(1);
    expect(engine.state.titleIndex).toBe(1);
    await press("ArrowDown");
    await press("Enter");
    expect(engine.state.screen).toBe("playing");
  });
  it("freezes all round time on pause and resumes its fraction and bite", async () => {
    const { engine, d, start, press, step } = await setup();
    await start();
    engine.apply((s) => d.setPellet(s, 16, 8));
    await step(0.18);
    await press("KeyP");
    const paused = engine.state;
    await step(10);
    expect(engine.state).toEqual(paused);
    await press("Escape");
    await step(0.07);
    expect(engine.state.ticks).toBe(2);
  });
  it("restarts cleanly, preserves best, and stops music on menu and death", async () => {
    const { engine, d, start, press, step } = await setup();
    const loops: string[] = [];
    engine.events.on("cue:looped", (e) => loops.push(e.cue));
    engine.events.on("cue:stopped", (e) => loops.push("stop:" + e.cue));
    await start();
    engine.apply((s) => d.setScore(s, 120));
    await press("KeyP");
    await press("ArrowDown");
    await press("Enter");
    expect(engine.state.score).toBe(0);
    expect(engine.state.best).toBe(120);
    expect(loops).toEqual(["music"]);
    await press("Escape");
    await press("ArrowUp");
    await press("Enter");
    expect(engine.state.screen).toBe("title");
    expect(loops).toEqual(["music", "stop:music"]);
    await start();
    await step(3);
    expect(engine.state.screen).toBe("gameover");
    expect(loops.slice(-2)).toEqual(["music", "stop:music"]);
    await press("Enter");
    expect(engine.state.screen).toBe("playing");
  });
  it("mirrors mute on every screen, and reset preserves it alone", async () => {
    const { engine, d, press } = await setup();
    await press("KeyM");
    expect(engine.state.muted).toBe(true);
    engine.apply((s) => d.setScore(s, 90));
    await engine.advance(1);
    expect(engine.state.best).toBe(90);
    engine.apply((s) => d.reset(s));
    expect(engine.state.muted).toBe(true);
    expect(engine.state.best).toBe(0);
    expect(engine.state.ticks).toBe(0);
  });
  it.each(["mouse", "touch"])(
    "confirms same-frame %s edges, but not mismatched regions",
    async (device) => {
      const { engine, d, pointer } = await setup();
      const first = d.menuItemRect(engine.state, 0)!;
      const second = d.menuItemRect(engine.state, 1)!;
      pointer("down", first.x + 10, first.y + 10, device);
      pointer("up", second.x + 10, second.y + 10, device);
      await engine.advance(1);
      expect(engine.state.screen).toBe("title");
      expect(engine.state.menuIndex).toBe(1);
      pointer("down", second.x + 10, second.y + 10, device);
      pointer("up", second.x + 10, second.y + 10, device);
      await engine.advance(1);
      expect(engine.state.screen).toBe("howto");
    },
  );
  it("keeps driver faculties independent and retains the next spawn while disabled", async () => {
    const { engine, d, start, press, step } = await setup();
    await start();
    engine.apply((s) => d.setPelletRespawn(s, false));
    engine.apply((s) => d.setNextPellet(s, 20, 10));
    engine.apply((s) => d.setPellet(s, 16, 8));
    await step();
    expect(engine.state.pellet).toBeNull();
    expect(engine.state.nextPellet).toEqual({ col: 20, row: 10 });
    engine.apply((s) => d.setSnakeTravel(s, false));
    await press("ArrowDown");
    await step();
    expect(engine.state.dir).toBe("down");
    expect(engine.state.snake[0]).toEqual({ col: 16, row: 8 });
    await press("ArrowLeft");
    engine.apply((s) => d.setSnakeSteering(s, false));
    expect(engine.state.turns).toEqual([]);
    await press("ArrowUp");
    await step();
    expect(engine.state.dir).toBe("down");
    expect(engine.state.turns).toEqual([]);
    expect(engine.state.comboWindow).toBe(3.125);
  });
  it("draws only valid cells without consuming poses or modifying the state", async () => {
    const { engine, d, start } = await setup();
    await start();
    engine.apply((s) => d.setNextPellet(s, 0, 0));
    const before = d.snapshot(engine.state);
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const c = d.drawPelletCell(engine.state)!;
      expect(c.col).toBeGreaterThan(0);
      expect(c.row).toBeGreaterThan(0);
      expect(engine.state.snake).not.toContainEqual(c);
      expect(c).not.toEqual(engine.state.pellet);
      const k = JSON.stringify(c);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(435);
    expect(d.snapshot(engine.state)).toEqual(before);
  });
  it("validates poses and keeps reconcile pure on all screens", async () => {
    const { engine, d } = await setup();
    const s = engine.state;
    for (const fn of [
      () => d.setScore(s, -1),
      () => d.setBest(s, NaN),
      () => d.setCombo(s, 6),
      () => d.setComboWindow(s, 4),
      () => d.setSnake(s, []),
      () => d.setSnake(s, [{ col: 0, row: 0 }]),
      () =>
        d.setSnake(s, [
          { col: 2, row: 2 },
          { col: 4, row: 2 },
        ]),
      () => d.setPellet(s, 15, 8),
      () => d.setNextPellet(s, 30, 1),
      () => d.setMenuIndex(s, 2),
      () => d.menuItemRect(s, -1),
    ])
      expect(fn).toThrow();
    for (const screen of C.SCREENS) {
      engine.apply((s) => d.setScreen(s, screen));
      const before = d.snapshot(engine.state);
      engine.apply((s) => d.reconcile(s));
      expect(d.snapshot(engine.state)).toEqual(before);
      await engine.advance(1);
    }
    expect(d.menuItemRect(d.setScreen(engine.state, "playing"), 0)).toBeNull();
    expect(d.menuItemRect(s, 99)).toBeNull();
  });
  it("records real rendering without changing simulation and reports current diagnostics", async () => {
    const { engine, d, start } = await setup();
    await start();
    engine.apply((s) => d.setSnakeTravel(s, false));
    engine.apply((s) => d.setScore(s, 70));
    engine.startRecording();
    await engine.advance(2);
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(2);
    expect(recording.images.length).toBeGreaterThan(0);
    expect(engine.state.ticks).toBe(0);
    expect(engine.diagnostics()).toContainEqual({ name: "score", value: 70 });
  });
});
