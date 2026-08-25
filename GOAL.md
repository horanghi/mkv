# GOAL — Grimhollow (`mkv`)

Build directive. A browser hardcore 2D platformer in the Ghosts 'n Goblins lineage: brutal but fair, with getting hit as the best-looking thing on screen.

**Stack.** TypeScript 7 · PixiJS v8 · Vite · Vercel. Custom fixed-timestep physics, no lib. Tiled, Aseprite, Howler, localStorage.

## Spec: `docs/`

```
01 concept  02 mechanics+numbers  03 weapons  04 stages  05 enemies+bosses
06 visuals+game-feel  07 audio  08 difficulty  09 UI  10 tech  11 roadmap
12 sprites
```

**Read the matching doc before touching a subsystem.** Every number lives in a table there — never invent one, never let code and table disagree.

## Non-negotiables

1. **Fixed jump arc.** No air control. Reading the level before jumping *is* the game. → 02
2. **Two hits kill.** Steel → underwear → death. Relic armor adds one hit + awakening. → 02, 03
3. **Death to playable under 3 seconds.** Miss this and every other decision is void. → 09
4. **Armor break is the showpiece.** 180ms hitstop, 24 shards from real sprite pixels, flash, aberration, shake. Spend real budget. → 06
5. **Initial load under 8MB**, lazy per stage. This is why we chose web over Godot. → 10
   *Enforced at build time — `npm run build` fails over budget (`scripts/check-size.mjs`).*
6. **Logical res 480×270, integer scale only.** 16px tiles. Tiles snap to grid; particles and shaders do not. → 06

## Core numbers

Tune in M0, then freeze. Tables → 02.

```
run 110px/s   jump -420px/s   gravity 1500 up / 1750 down
coyote 5f     buffer 6f       i-frames 72f
max 2 projectiles on screen (dagger 3)
```

## Build order

**M0 (2w) grey box.** Loop, AABB tile collision, movement, one weapon, debug overlay. No art or effects. → 02, 10
*Gate:* five testers say the jump feels good. If they call the fixed arc frustrating, change the design — not the tuning.

**M1 (6w) vertical slice.** Stage 1 at ship quality: three weapons, armor states, boss Cairn, full post-FX stack, armor-break and death sequences, BGM, HUD. → 03–07, 09, 12
*Gate:* retry-after-death ≥90%, 60fps mid-tier laptop, first clear in 8–15 attempts. No new stages until this passes.

**M2 (10w).** Stages 2–4, remaining weapons, three relic armors, 21 awakenings, difficulty modes. → 03, 04, 05, 08
Awakenings are palette swaps + particles; five unique sprites max.

**M3 (8w).** Stages 5–6, Galahad and Asmodeus, the Phantasm second loop, Lucian. → 04, 05, 06, 08
Prototype Stage 1's Phantasm first; if it reads as a rerun, add terrain rework.

**M4 (4w).** Balance, perf tiers, accessibility, deploy. → 08, 09, 10

## Rules

- Immutable state; never mutate. Pool only in profiled hot paths.
- Files 200–400 lines, 800 hard max.
- Deterministic logic; golden replay tests catch a 1px jump change no human sees.
- Coverage: physics 95%, state machines 85%, overall 80%. Render: visual check.
- Build dev tools early: stage warp, frame step, slow-mo, hitbox overlay, hot-reload.

## Start here

M0 only. Grey boxes, no art, no scope creep. Read 02 and 10, then answer: **is the jump fun?**
