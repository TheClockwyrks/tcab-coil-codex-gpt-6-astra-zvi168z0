import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export interface Model {
  screen: C.Screen;
  menuIndex: number;
  titleIndex: number;
  score: number;
  best: number;
  combo: number;
  comboWindow: number;
  muted: boolean;
  ticks: number;
  simTime: number;
  dir: C.Direction;
  turns: readonly C.Direction[];
  snake: readonly C.Cell[];
  pellet: C.Cell | null;
  obstacles: readonly C.Cell[];
  steering: boolean;
  travel: boolean;
  pelletRespawn: boolean;
  nextPellet: C.Cell | null;
  accumulator: number;
  biteAt: number;
  bursts: readonly { cell: C.Cell; time: number; points: number }[];
  pointerPress: { id: number; index: number; screen: C.Screen } | null;
  sprites: Readonly<Record<string, ImageBitmap>>;
}
export type State = DeepReadonly<Model>;

export function opening(sprites: Model["sprites"], muted = false): Model {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    score: 0,
    best: 0,
    combo: 1,
    comboWindow: 0,
    muted,
    ticks: 0,
    simTime: 0,
    dir: C.START_DIR,
    turns: [],
    snake: C.START_CELLS.map((c) => ({ ...c })),
    pellet: null,
    obstacles: [],
    steering: true,
    travel: true,
    pelletRespawn: true,
    nextPellet: null,
    accumulator: 0,
    biteAt: -1,
    bursts: [],
    pointerPress: null,
    sprites,
  };
}
export const same = (a: C.Cell, b: C.Cell): boolean =>
  a.col === b.col && a.row === b.row;
export const interior = (c: C.Cell): boolean =>
  Number.isInteger(c.col) &&
  Number.isInteger(c.row) &&
  c.col >= C.INTERIOR_MIN_COL &&
  c.col <= C.INTERIOR_MAX_COL &&
  c.row >= C.INTERIOR_MIN_ROW &&
  c.row <= C.INTERIOR_MAX_ROW;
export function validCells(s: State): C.Cell[] {
  const occupied = new Set(
    [...s.snake, ...s.obstacles, ...(s.pellet ? [s.pellet] : [])].map(
      (c) => `${c.col},${c.row}`,
    ),
  );
  const result: C.Cell[] = [];
  for (let row = C.INTERIOR_MIN_ROW; row <= C.INTERIOR_MAX_ROW; row++)
    for (let col = C.INTERIOR_MIN_COL; col <= C.INTERIOR_MAX_COL; col++)
      if (!occupied.has(`${col},${row}`)) result.push({ col, row });
  return result;
}
export function drawPelletCell(s: State): C.Cell | null {
  const cells = validCells(s);
  return cells[Math.floor(Math.random() * cells.length)] ?? null;
}
export function spawn(s: State): Model {
  const cells = validCells(s);
  const pellet =
    cells.find((c) => s.nextPellet && same(c, s.nextPellet)) ??
    cells[Math.floor(Math.random() * cells.length)] ??
    null;
  return { ...s, pellet, nextPellet: null };
}
export function menuItems(screen: C.Screen): readonly string[] {
  switch (screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "gameover":
    case "cleared":
      return C.OVER_ITEMS;
    case "howto":
      return ["BACK"];
    case "playing":
      return [];
  }
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function menuItemRect(s: State, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError("index must be a non-negative integer");
  if (index >= menuItems(s.screen).length) return null;
  return s.screen === "title"
    ? { x: 230, y: 436 + index * 66, w: 340, h: 54 }
    : s.screen === "howto"
      ? { x: 460, y: 594, w: 360, h: 50 }
      : { x: 460, y: 414 + index * 64, w: 360, h: 50 };
}
export function enter(s: State, screen: C.Screen): Model {
  return {
    ...s,
    screen,
    menuIndex: screen === "title" ? s.titleIndex : 0,
    pointerPress: null,
  };
}
export function startRound(s: State): Model {
  return spawn({
    ...s,
    screen: "playing",
    menuIndex: 0,
    score: 0,
    combo: 1,
    comboWindow: 0,
    snake: C.START_CELLS.map((c) => ({ ...c })),
    dir: C.START_DIR,
    turns: [],
    pellet: null,
    obstacles: C.OBSTACLE_CELLS,
    accumulator: 0,
    biteAt: -1,
    bursts: [],
    pointerPress: null,
  });
}
export const vector: Record<C.Direction, C.Cell> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

/** The six ordered phases of a fixed tick. Only this function moves the chain. */
export function tick(state: State, cue: (name: C.CueName) => void): Model {
  let s: Model = { ...state, ticks: state.ticks + 1 };
  const turn = s.turns[0];
  if (s.steering && turn) {
    s.turns = s.turns.slice(1);
    if (
      vector[turn].col * vector[s.dir].col +
        vector[turn].row * vector[s.dir].row ===
      0
    )
      s.dir = turn;
  }
  if (s.travel) {
    const head = s.snake[0];
    const next = {
      col: head.col + vector[s.dir].col,
      row: head.row + vector[s.dir].row,
    };
    const eating = s.pellet !== null && same(next, s.pellet);
    const solid = eating ? s.snake : s.snake.slice(0, -1);
    if (
      !interior(next) ||
      s.obstacles.some((c) => same(c, next)) ||
      solid.some((c) => same(c, next))
    ) {
      cue(C.CUES.death);
      return { ...enter(s, "gameover"), accumulator: 0 };
    }
    s.snake = [next, ...(eating ? s.snake : s.snake.slice(0, -1))];
    if (eating) {
      const combo = s.comboWindow > 0 ? Math.min(C.COMBO_MAX, s.combo + 1) : 1;
      cue(C.CUES.eat);
      if (combo > s.combo) cue(C.CUES.comboUp);
      s.combo = combo;
      s.score += C.PELLET_POINTS * combo;
      s.best = Math.max(s.best, s.score);
      s.comboWindow = C.COMBO_WINDOW;
      // Timestamp the tick within this frame, keeping animation tied to round time.
      s.biteAt = s.simTime - s.accumulator;
      s.bursts = [
        ...s.bursts,
        { cell: next, time: s.biteAt, points: C.PELLET_POINTS * combo },
      ];
      if (s.pelletRespawn) {
        s = spawn(s);
        if (s.pellet === null) s = { ...enter(s, "cleared"), accumulator: 0 };
      } else s.pellet = null;
    }
  }
  s.comboWindow = Math.max(0, s.comboWindow - C.TICK_SECONDS);
  if (s.comboWindow === 0) s.combo = 1;
  return s;
}
