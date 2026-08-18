Implement the fixed-timestep game loop.

Read `docs/10-tech-spec.md` section 10.3 first.

## Spec

- Logic tick locked to exactly 1/60s (16.667ms)
- Max 5 catch-up ticks per frame — spiral-of-death guard
- Render on `requestAnimationFrame`, interpolating positions between ticks with an alpha
- Hitstop freezes **logic ticks only**. These keep running during hitstop:
  - input polling and buffering (a press must never be swallowed)
  - UI animation
  - the hitstop timer itself

## Determinism is mandatory

The same input sequence must always produce the same final state. Rhythm sync (Stage 3),
replays, and regression tests all depend on it.

- Physics uses fixed dt only — never a frame-derived delta
- No `Math.random()` in logic without a seeded RNG
- No floating-point accumulation across ticks where an integer counter will do

## Done

- A golden replay test passes: recorded input sequence → identical final state
- Debug overlay shows a stable 60 ticks/sec with the frame-time graph flat
