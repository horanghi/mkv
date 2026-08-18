Set up the project skeleton for Grimhollow, a browser-based 2D action platformer.

First read `GOAL.md` and `docs/10-tech-spec.md`.

## Stack

- TypeScript 5 (strict, no implicit any) + Vite + PixiJS v8
- Deploy target: Vercel static
- Vitest with coverage thresholds — physics 95%, state machines 85%, overall 80%

## Directory layout

Exactly as `docs/10-tech-spec.md` section 10.2. Do not invent your own structure.

```
src/core/  physics/  entities/  render/  game/  ui/  data/
```

## Also create

- A debug overlay module stub — hitboxes, velocity vectors, state machine, frame time
- `data/*.json` for balance values, loaded at runtime (hot-reloadable later)

## Constraints

- Files 200-400 lines, 800 hard max
- Immutable state updates — return new objects, never mutate. Pool only in profiled hot paths.
- No game logic in this step

## Done

`npm run dev`, `npm run build`, and `npm test` all pass on a clean checkout.
