import "./stage.css";
import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { debug } from "./debug";
import {
  enter,
  menuItemRect,
  menuItems,
  opening,
  startRound,
  tick,
  type Model,
  type State,
} from "./model";
import { render } from "./render";

export type CoilState = Model;
export type CoilDebugApi = typeof debug;
export const BACKGROUND = "#071317";

function accept(s: State, api: UpdateApi): CoilState {
  let next: CoilState = { ...s };
  switch (s.screen) {
    case "title":
      next.titleIndex = s.menuIndex;
      if (s.menuIndex === 1) return enter(next, "howto");
      break;
    case "howto":
      return enter(s, "title");
    case "paused":
      if (s.menuIndex === 0) return enter(s, "playing");
      if (s.menuIndex === 2) return enter(s, "title");
      break;
    case "gameover":
    case "cleared":
      if (s.menuIndex === 1) return enter(s, "title");
      break;
    case "playing":
      return next;
  }
  next = startRound(next);
  api.audio.loop(C.CUES.music);
  return next;
}

export const game: Game<CoilState, CoilDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    const paths = [
      ...C.SPRITE_PATHS.head,
      C.SPRITE_PATHS.body,
      C.SPRITE_PATHS.corner,
      C.SPRITE_PATHS.tail,
    ];
    const [images] = await Promise.all([
      Promise.all(paths.map((path) => api.assets.loadImage(path))),
      Promise.all(
        Object.values(C.CUES).map((cue) =>
          api.audio.load(cue, C.CUE_PATHS[cue]),
        ),
      ),
    ]);
    const sprites = Object.fromEntries(
      paths.map((path, i) => [path, images[i]]),
    );
    for (const name of [
      "screen",
      "score",
      "best",
      "combo",
      "comboWindow",
      "dir",
    ] as const)
      api.diagnostics.register(name, (s) => s[name]);
    api.diagnostics.register("length", (s) => s.snake.length);
    api.diagnostics.register(
      "head",
      (s) => `${s.snake[0].col}, ${s.snake[0].row}`,
    );
    api.diagnostics.register("pellet", (s) =>
      s.pellet ? `${s.pellet.col}, ${s.pellet.row}` : "none",
    );
    return [opening(sprites), debug];
  },
  update(state, api, dt) {
    let s: CoilState = { ...state, best: Math.max(state.best, state.score) };
    const pressed = Object.fromEntries(
      C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
    );
    if (pressed.mute) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    if (s.screen === "playing") {
      if (pressed.back || pressed.pause) s = enter(s, "paused");
      else if (s.steering)
        for (const dir of C.DIRECTIONS)
          if (pressed[dir] && s.turns.length < C.TURN_QUEUE_MAX)
            s.turns = [...s.turns, dir];
    } else {
      const count = menuItems(s.screen).length;
      if (pressed.up) s.menuIndex = (s.menuIndex + count - 1) % count;
      if (pressed.down) s.menuIndex = (s.menuIndex + 1) % count;
      if (pressed.back && s.screen !== "title")
        s = enter(s, s.screen === "paused" ? "playing" : "title");
      else if (pressed.pause && s.screen === "paused") s = enter(s, "playing");
      else if (pressed.confirm) s = accept(s, api);
    }
    // Samples preserve both edges of a quick click, and touch contact identity.
    if (s.screen !== "playing")
      for (const p of api.input.pointerSamples()) {
        const index = menuItems(s.screen).findIndex((_, i) => {
          const r = menuItemRect(s, i)!;
          return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
        });
        if (index >= 0) s.menuIndex = index;
        if (p.type === "down")
          s.pointerPress =
            index >= 0 ? { id: p.id, index, screen: s.screen } : null;
        if (p.type === "up") {
          const press = s.pointerPress;
          s.pointerPress = null;
          if (
            press &&
            press.id === p.id &&
            press.index === index &&
            press.screen === s.screen
          )
            s = accept(s, api);
        }
      }
    if (s.screen === "playing") {
      s.simTime += dt;
      s.accumulator += dt;
      while (
        s.accumulator + 1e-10 >= C.TICK_SECONDS &&
        s.screen === "playing"
      ) {
        s.accumulator = Math.max(0, s.accumulator - C.TICK_SECONDS);
        s = tick(s, (cue) => api.audio.play(cue));
      }
      s.bursts = s.bursts.filter((b) => s.simTime - b.time < 0.65);
    }
    s.best = Math.max(s.best, s.score);
    if (s.screen !== "playing" && s.screen !== "paused")
      api.audio.stop(C.CUES.music);
    return s;
  },
  render,
};
