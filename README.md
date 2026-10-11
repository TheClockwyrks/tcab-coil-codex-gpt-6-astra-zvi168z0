# Coil

A neon grid serpent with a decaying combo. Eat amber pellets, grow a continuous
pixel-art coil, and plan the next route before your multiplier expires. Classic
runs at eight ticks per second on an enclosed 30 × 18 grid. The session best
survives restarts; no scores or preferences are persisted between visits.

## Run

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The complete game runs in the browser, with
no backend, external services, or credentials.

## Build

```sh
npm run build
npm run preview
```

Publish `dist/` as a static site, either at a host's root or under a subdirectory.
All asset URLs are page-relative. `public/assets` links to the committed `assets/`
directory so Vite copies the original PNGs and WAVs into the build. No generation
binary is needed by installation, development, tests, or production builds.

## Controls

| Action | Keys |
| --- | --- |
| Steer | Arrow keys or WASD |
| Select a menu item | Up / Down or W / S |
| Confirm | Enter or Space |
| Pause / resume | P or Escape |
| Back | Escape |
| Toggle sound | M |
| Debug overlay | Backtick |

Menus also support pointer and touch input. Touching the game reveals its
on-screen directional pad and action buttons. Audio unlocks on the first input.
The pause menu offers resume, restart, and return to the title.

## Assets and showcase

The snake's seven transparent pixel sprites were authored with `draw` and
`draw-sheet`; the head has a four-frame bite animation. `sfx-synth` produced the
three event cues. `music` produced a sixteen-beat electronic loop, mastered to
an exact ten-second period. Pellet sparks, glow, grid and interface are drawn
by the game. All shipped sounds and sprites are original and committed under
`assets/`. `tools/produce_assets.py` preserves the one-time authoring recipe;
it is deliberately separate from the build and requires the authoring binaries.

The [showcase](showcase/showcase.md) contains screenshots and a six-second replay
of actual game drawing captured with the Simple 2D recorder. With the development
server running, `node tools/capture.mjs` reproduces those captures using the
project's Playwright. Its staged mid-round chain then travels, turns, eats,
animates and scores through the normal game systems.

## Verification and code

```sh
npm run typecheck
npm run lint
npm run format
npm test
node tools/browser-check.mjs # after building; verifies root and sub-path hosting
```

Tests run the real Simple 2D engine over a native canvas with a scripted clock.
They cover tick accumulation, queued turns, growth, collision and the tail rule,
combo boundaries, board clearing, menu input, audio events, pause behavior,
driver switches and the debug API. Browser codecs are adapted for Node; the
committed images and WAVs are loaded in the tests.

`src/model.ts` contains the render-free simulation, `src/debug.ts` the validated
poses and snapshots, `src/game.ts` engine wiring and input, and `src/render.ts`
presentation. The required `game`, `CoilState`, `CoilDebugApi`, and `BACKGROUND`
are exported by `src/game.ts`. State is replaced by value; rendering never
advances it. The debug surface is available only through an engine handle,
with no game state published on the page.
