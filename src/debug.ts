import * as C from "./constants";
import {
  drawPelletCell,
  interior,
  menuItemRect,
  menuItems,
  opening,
  same,
  type State,
} from "./model";

function requireValue(ok: boolean, name: string): void {
  if (!ok) throw new RangeError(`Invalid ${name}`);
}
function whole(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}
function boolean(value: boolean): void {
  requireValue(typeof value === "boolean", "switch");
}
function free(s: State, cell: C.Cell): boolean {
  return (
    interior(cell) &&
    !s.snake.some((c) => same(c, cell)) &&
    !s.obstacles.some((c) => same(c, cell))
  );
}
export const debug = {
  version: C.COIL_DEBUG_VERSION,
  reset: (s: State) => opening(s.sprites, s.muted),
  reconcile: (s: State) => ({ ...s }),
  snapshot: (s: State) => ({
    version: C.COIL_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    mode: C.MODE,
    score: s.score,
    best: s.best,
    combo: s.combo,
    comboWindow: s.comboWindow,
    muted: s.muted,
    ticks: s.ticks,
    simTime: s.simTime,
    dir: s.dir,
    turns: [...s.turns],
    snake: s.snake.map((c) => ({ ...c })),
    pellet: s.pellet ? { ...s.pellet } : null,
    obstacles: s.obstacles.map((c) => ({ ...c })),
    steering: s.steering,
    travel: s.travel,
    pelletRespawn: s.pelletRespawn,
    nextPellet: s.nextPellet ? { ...s.nextPellet } : null,
  }),
  menuItemRect,
  setScreen(s: State, screen: C.Screen) {
    requireValue(C.SCREENS.includes(screen), "screen");
    return { ...s, screen };
  },
  setMenuIndex(s: State, menuIndex: number) {
    requireValue(
      whole(menuIndex) && menuIndex < Math.max(1, menuItems(s.screen).length),
      "menu index",
    );
    return { ...s, menuIndex };
  },
  setScore(s: State, score: number) {
    requireValue(whole(score), "score");
    return { ...s, score };
  },
  setBest(s: State, best: number) {
    requireValue(whole(best), "best");
    return { ...s, best };
  },
  setCombo(s: State, combo: number) {
    requireValue(whole(combo) && combo >= 1 && combo <= C.COMBO_MAX, "combo");
    return { ...s, combo };
  },
  setComboWindow(s: State, comboWindow: number) {
    requireValue(
      Number.isFinite(comboWindow) &&
        comboWindow >= 0 &&
        comboWindow <= C.COMBO_WINDOW,
      "combo window",
    );
    return { ...s, comboWindow };
  },
  setSnake(s: State, cells: readonly C.Cell[]) {
    requireValue(cells.length > 0, "empty snake");
    cells.forEach((c, i) =>
      requireValue(
        interior(c) &&
          !s.obstacles.some((o) => same(o, c)) &&
          !cells.slice(0, i).some((o) => same(o, c)) &&
          (i === 0 ||
            Math.abs(c.col - cells[i - 1].col) +
              Math.abs(c.row - cells[i - 1].row) ===
              1),
        "snake chain",
      ),
    );
    return { ...s, snake: cells.map((c) => ({ ...c })) };
  },
  setDirection(s: State, dir: C.Direction) {
    requireValue(C.DIRECTIONS.includes(dir), "direction");
    return { ...s, dir };
  },
  clearTurns: (s: State) => ({ ...s, turns: [] }),
  setSnakeSteering(s: State, steering: boolean) {
    boolean(steering);
    return { ...s, steering, turns: steering ? s.turns : [] };
  },
  setSnakeTravel(s: State, travel: boolean) {
    boolean(travel);
    return { ...s, travel };
  },
  setPellet(s: State, col: number, row: number) {
    const pellet = { col, row };
    requireValue(free(s, pellet), "pellet cell");
    return { ...s, pellet };
  },
  clearPellet: (s: State) => ({ ...s, pellet: null }),
  setPelletRespawn(s: State, pelletRespawn: boolean) {
    boolean(pelletRespawn);
    return { ...s, pelletRespawn };
  },
  setNextPellet(s: State, col: number, row: number) {
    requireValue(
      whole(col) && whole(row) && col < C.GRID_COLS && row < C.GRID_ROWS,
      "next pellet",
    );
    return { ...s, nextPellet: { col, row } };
  },
  drawPelletCell,
};
