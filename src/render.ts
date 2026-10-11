import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { menuItemRect, menuItems, type State } from "./model";

const ink = "#e4f9ed",
  mint = "#83f6bb",
  quiet = "#71918f",
  amber = "#ffc275";
type Context = RenderApi["ctx"];
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  align: CanvasTextAlign = "left",
  weight = 500,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${size < 20 ? "monospace" : "Arial, sans-serif"}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function sprite(
  ctx: Context,
  s: State,
  path: string,
  col: number,
  row: number,
  rotation: number,
): void {
  ctx.save();
  ctx.translate(
    C.BOARD_X + (col + 0.5) * C.CELL,
    C.BOARD_Y + (row + 0.5) * C.CELL,
  );
  ctx.rotate((rotation * Math.PI) / 2);
  ctx.drawImage(s.sprites[path], -C.CELL / 2, -C.CELL / 2, C.CELL, C.CELL);
  ctx.restore();
}
function direction(a: C.Cell, b: C.Cell): number {
  return b.col > a.col ? 0 : b.row > a.row ? 1 : b.col < a.col ? 2 : 3;
}
function snake(
  ctx: Context,
  s: State,
  cells: readonly C.Cell[],
  dir: C.Direction,
  frame = 0,
): void {
  const angles = { right: 0, down: 1, left: 2, up: 3 };
  ctx.save();
  ctx.shadowColor = "#40dbab";
  ctx.shadowBlur = 8;
  cells.forEach((cell, i) => {
    if (i === 0) {
      sprite(
        ctx,
        s,
        C.SPRITE_PATHS.head[frame],
        cell.col,
        cell.row,
        angles[dir],
      );
      return;
    }
    const a = direction(cell, cells[i - 1]);
    if (i === cells.length - 1) {
      sprite(ctx, s, C.SPRITE_PATHS.tail, cell.col, cell.row, a);
      return;
    }
    const b = direction(cell, cells[i + 1]);
    if (Math.abs(a - b) === 2)
      sprite(ctx, s, C.SPRITE_PATHS.body, cell.col, cell.row, a % 2);
    else {
      const angle = [0, 1, 2, 3].find(
        (r) => (a === r && b === (r + 1) % 4) || (b === r && a === (r + 1) % 4),
      )!;
      sprite(ctx, s, C.SPRITE_PATHS.corner, cell.col, cell.row, angle);
    }
  });
  ctx.restore();
}
function pellet(ctx: Context, col: number, row: number, time: number): void {
  const x = C.BOARD_X + (col + 0.5) * C.CELL,
    y = C.BOARD_Y + (row + 0.5) * C.CELL;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#906e45";
  ctx.lineWidth = 1;
  ctx.strokeRect(-14, -14, 28, 28);
  ctx.shadowColor = amber;
  ctx.shadowBlur = 13 + 3 * Math.sin(time * 5);
  ctx.fillStyle = amber;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(10, 0);
  ctx.lineTo(0, 10);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff5cc";
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
}
function board(ctx: Context, s: State): void {
  const w = C.GRID_COLS * C.CELL,
    h = C.GRID_ROWS * C.CELL;
  const field = ctx.createRadialGradient(
    C.STAGE_CX,
    400,
    10,
    C.STAGE_CX,
    400,
    620,
  );
  field.addColorStop(0, "#10272a");
  field.addColorStop(1, "#09181e");
  ctx.fillStyle = field;
  ctx.fillRect(C.BOARD_X, C.BOARD_Y, w, h);
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      const x = C.BOARD_X + col * C.CELL,
        y = C.BOARD_Y + row * C.CELL;
      const wall =
        row === 0 ||
        col === 0 ||
        row === C.GRID_ROWS - 1 ||
        col === C.GRID_COLS - 1;
      if (wall) {
        ctx.fillStyle = "#173137";
        ctx.fillRect(x + 1, y + 1, C.CELL - 2, C.CELL - 2);
        ctx.fillStyle = "#26464a";
        ctx.fillRect(x + 4, y + 4, C.CELL - 8, 2);
        ctx.fillStyle = "#0e252b";
        ctx.fillRect(x + 4, y + C.CELL - 6, C.CELL - 8, 2);
      } else {
        ctx.strokeStyle = "#193035";
        ctx.lineWidth = 0.7;
        ctx.strokeRect(x, y, C.CELL, C.CELL);
      }
    }
  ctx.strokeStyle = "#47776d";
  ctx.lineWidth = 1;
  ctx.strokeRect(
    C.BOARD_X + C.CELL - 0.5,
    C.BOARD_Y + C.CELL - 0.5,
    w - 2 * C.CELL + 1,
    h - 2 * C.CELL + 1,
  );
  ctx.strokeStyle = "#315356";
  ctx.strokeRect(C.BOARD_X - 4, C.BOARD_Y - 4, w + 8, h + 8);
  for (const x of [C.BOARD_X - 5, C.BOARD_X + w - 23])
    for (const y of [C.BOARD_Y - 5, C.BOARD_Y + h + 3]) {
      ctx.fillStyle = mint;
      ctx.fillRect(x, y, 28, 2);
    }
  for (let row = 2; row < C.GRID_ROWS - 1; row += 2)
    text(
      ctx,
      String(row).padStart(2, "0"),
      C.BOARD_X - 22,
      C.BOARD_Y + (row + 0.5) * C.CELL,
      10,
      "#476362",
      "right",
    );
  for (const c of s.obstacles) {
    const x = C.BOARD_X + c.col * C.CELL,
      y = C.BOARD_Y + c.row * C.CELL;
    ctx.fillStyle = "#6b5265";
    ctx.fillRect(x + 2, y + 2, C.CELL - 4, C.CELL - 4);
    line(ctx, x + 5, y + 5, x + 27, y + 27, "#ce92ae");
    line(ctx, x + 27, y + 5, x + 5, y + 27, "#ce92ae");
  }
}
function hud(ctx: Context, s: State): void {
  text(ctx, C.TITLE_TEXT, C.BOARD_X, 44, 30, mint, "left", 900);
  text(ctx, C.MODE_LABEL, C.BOARD_X, 78, 12, quiet);
  text(ctx, C.SCORE_LABEL, 370, 38, 12, quiet);
  text(ctx, String(s.score).padStart(4, "0"), 370, 76, 38, ink, "left", 700);
  text(ctx, C.BEST_LABEL, 548, 38, 12, quiet);
  text(ctx, String(s.best).padStart(4, "0"), 548, 76, 38, ink, "left", 700);
  if (s.combo >= 2) {
    text(ctx, `x${s.combo}`, 745, 50, 36, amber, "left", 700);
    text(ctx, "COMBO", 802, 48, 12, amber);
    ctx.fillStyle = "#283735";
    ctx.fillRect(745, 80, 175, 5);
    ctx.fillStyle = amber;
    ctx.fillRect(745, 80, (175 * s.comboWindow) / C.COMBO_WINDOW, 5);
  }
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    C.BOARD_X + C.GRID_COLS * C.CELL,
    40,
    12,
    s.muted ? amber : quiet,
    "right",
  );
  text(
    ctx,
    "P  PAUSE",
    C.BOARD_X + C.GRID_COLS * C.CELL,
    78,
    12,
    quiet,
    "right",
  );
}
function buttons(ctx: Context, s: State): void {
  menuItems(s.screen).forEach((label, i) => {
    const r = menuItemRect(s, i)!;
    const active = s.menuIndex === i;
    ctx.fillStyle = active ? mint : "#102328";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? "#c5ffda" : "#315052";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    text(
      ctx,
      label,
      r.x + 22,
      r.y + r.h / 2,
      16,
      active ? "#0c3027" : "#a9c3ba",
      "left",
      700,
    );
    text(
      ctx,
      active ? "↗" : "·",
      r.x + r.w - 24,
      r.y + r.h / 2,
      22,
      active ? "#0c3027" : quiet,
      "center",
    );
  });
}
const titleCoil: C.Cell[] = [];
// A static composition made from the same native-size sprites as the live chain.
for (let col = 25; col >= 19; col--) titleCoil.push({ col, row: 5 });
for (let row = 6; row <= 8; row++) titleCoil.push({ col: 19, row });
for (let col = 20; col <= 25; col++) titleCoil.push({ col, row: 8 });
for (let row = 9; row <= 11; row++) titleCoil.push({ col: 25, row });
for (let col = 24; col >= 19; col--) titleCoil.push({ col, row: 11 });
for (let row = 12; row <= 13; row++) titleCoil.push({ col: 19, row });
for (let col = 20; col <= 24; col++) titleCoil.push({ col, row: 13 });

function title(ctx: Context, s: State): void {
  ctx.fillStyle = "rgba(7,19,23,0.74)";
  ctx.fillRect(
    C.BOARD_X,
    C.BOARD_Y,
    C.GRID_COLS * C.CELL,
    C.GRID_ROWS * C.CELL,
  );
  text(ctx, "01 / CLASSIC ARCADE", 230, 188, 12, quiet);
  text(ctx, C.TITLE_TEXT, 220, 291, 132, ink, "left", 900);
  text(ctx, C.TAGLINE_TEXT, 232, 370, 19, mint);
  text(ctx, "Find your line. Keep the chain alive.", 232, 406, 14, quiet);
  snake(ctx, s, titleCoil, "right");
  pellet(ctx, 27, 5, 0);
  text(ctx, "EAT  /  GROW  /  REPEAT", 884, 604, 12, quiet, "center");
  text(ctx, "THE NEXT MOVE IS EVERYTHING.", 230, 624, 11, quiet);
  text(ctx, C.BEST_LABEL, 1052, 192, 12, quiet, "right");
  text(ctx, String(s.best).padStart(4, "0"), 1052, 228, 32, ink, "right", 700);
  buttons(ctx, s);
}
function panel(ctx: Context, s: State): void {
  ctx.fillStyle = "rgba(4,14,18,0.74)";
  ctx.fillRect(
    C.BOARD_X,
    C.BOARD_Y,
    C.GRID_COLS * C.CELL,
    C.GRID_ROWS * C.CELL,
  );
  const how = s.screen === "howto";
  const x = how ? 288 : 396,
    w = how ? 704 : 488;
  ctx.fillStyle = "#0c2025";
  ctx.fillRect(x, 164, w, how ? 496 : 450);
  ctx.strokeStyle = "#3d6462";
  ctx.strokeRect(x + 0.5, 164.5, w - 1, how ? 495 : 449);
  ctx.fillStyle = mint;
  ctx.fillRect(x, 164, 60, 3);
  if (how) {
    text(ctx, "HOW TO PLAY", 336, 208, 30, ink, "left", 800);
    const rows = [
      [
        "01",
        "FIND YOUR LINE",
        "You never stop. Arrow keys or WASD turn on the next tick.",
      ],
      ["02", "MAKE ROOM", "Turn at right angles. You cannot double back."],
      [
        "03",
        "CHASE THE LIGHT",
        "Eat amber pellets to grow. Walls and your body end the run.",
      ],
      [
        "04",
        "KEEP IT GOING",
        `Eat again within ${C.COMBO_WINDOW} seconds to build up to x${C.COMBO_MAX}. Wait, and it resets.`,
      ],
    ];
    rows.forEach(([n, heading, copy], i) => {
      const y = 270 + i * 68;
      text(ctx, n, 336, y, 14, mint);
      text(ctx, heading, 379, y, 15, ink, "left", 700);
      text(ctx, copy, 379, y + 25, 12, quiet);
    });
    text(
      ctx,
      "ENTER / SPACE  SELECT     ESC / P  PAUSE     M  SOUND",
      C.STAGE_CX,
      560,
      12,
      quiet,
      "center",
    );
  } else if (s.screen === "paused") {
    text(ctx, "ROUND ON HOLD", C.STAGE_CX, 216, 12, mint, "center");
    text(ctx, "PAUSED", C.STAGE_CX, 280, 50, ink, "center", 800);
    text(
      ctx,
      "Take a breath. Your line will wait.",
      C.STAGE_CX,
      344,
      14,
      quiet,
      "center",
    );
  } else {
    text(
      ctx,
      s.screen === "cleared" ? "A PERFECT CIRCUIT" : "END OF LINE",
      C.STAGE_CX,
      211,
      12,
      s.screen === "cleared" ? mint : amber,
      "center",
    );
    text(
      ctx,
      s.screen === "cleared" ? C.CLEARED_TEXT : C.GAMEOVER_TEXT,
      C.STAGE_CX,
      264,
      s.screen === "cleared" ? 36 : 44,
      ink,
      "center",
      800,
    );
    text(ctx, C.SCORE_LABEL, 550, 323, 12, quiet, "center");
    text(ctx, C.BEST_LABEL, 730, 323, 12, quiet, "center");
    text(ctx, String(s.score), 550, 365, 36, mint, "center", 700);
    text(ctx, String(s.best), 730, 365, 36, ink, "center", 700);
  }
  buttons(ctx, s);
}

export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#071317";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  line(ctx, C.BOARD_X, 104, C.BOARD_X + C.GRID_COLS * C.CELL, 104, "#244044");
  if (s.screen === "title") {
    text(ctx, "C /", C.BOARD_X, 61, 28, mint, "left", 800);
    text(ctx, "COIL   /   GRID SYSTEM 01", 226, 61, 12, quiet);
    text(
      ctx,
      s.muted ? "M  SOUND OFF" : "M  SOUND ON",
      1120,
      61,
      12,
      s.muted ? amber : quiet,
      "right",
    );
  } else hud(ctx, s);
  board(ctx, s);
  if (s.screen === "title") title(ctx, s);
  else {
    if (s.pellet) pellet(ctx, s.pellet.col, s.pellet.row, s.simTime);
    const bite = s.simTime - s.biteAt;
    const frame =
      s.biteAt >= 0 && bite >= 0 && bite < C.BITE_SECONDS
        ? 1 +
          Math.min(
            C.HEAD_FRAMES - 2,
            Math.floor((bite / C.BITE_SECONDS) * (C.HEAD_FRAMES - 1)),
          )
        : 0;
    snake(ctx, s, s.snake, s.dir, frame);
    for (const b of s.bursts) {
      const age = s.simTime - b.time;
      if (age < 0 || age > 0.65) continue;
      const x = C.BOARD_X + (b.cell.col + 0.5) * C.CELL,
        y = C.BOARD_Y + (b.cell.row + 0.5) * C.CELL;
      ctx.save();
      ctx.globalAlpha = 1 - age / 0.65;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const radius = 12 + age * 65;
        ctx.fillStyle = i % 2 ? amber : mint;
        ctx.fillRect(
          x + Math.cos(angle) * radius - 1,
          y + Math.sin(angle) * radius - 1,
          3,
          3,
        );
      }
      text(ctx, `+${b.points}`, x, y - 24 - age * 32, 14, amber, "center", 700);
      ctx.restore();
    }
    if (s.screen !== "playing") panel(ctx, s);
  }
  ctx.save();
  ctx.translate(1192, 410);
  ctx.rotate(Math.PI / 2);
  text(ctx, "STAY SHARP. STAY IN MOTION.", 0, 0, 11, "#45625f", "center");
  ctx.restore();
  text(
    ctx,
    s.screen === "playing"
      ? "ARROWS / WASD  STEER    ESC / P  PAUSE"
      : "↑ ↓  SELECT    ENTER  CONFIRM",
    C.STAGE_CX,
    710,
    10,
    "#64837b",
    "center",
  );
}
