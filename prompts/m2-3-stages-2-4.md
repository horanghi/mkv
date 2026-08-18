Build stages 2, 3, and 4 with their bosses.

Read `docs/04-stages.md` and `docs/05-enemies-bosses.md`.

## Follow the pipeline — and do not skip step 3

```
1. paper  →  2. greybox (Tiled)  →  3. PLAYTEST THE GREYBOX  →
4. art pass  →  5. FX pass  →  6. audio pass
```

Once art lands, levels become expensive to change. Five testers on the grey-box costs a
day; rebuilding a finished stage costs a week.

## Stages

| # | Stage | Gimmick | Boss |
|---|---|---|---|
| 2 | Grimhollow Ablaze | spreading fire pushes the player forward (40s forced advance) | Morg & Mag |
| 3 | The Frozen Belfry | bell every 4s drives platforms and boss patterns | Byrna |
| 4 | Mire of Whispers | rising water, poison fog limits sight | Muck |

## Stage 3 — audio-locked gameplay

The bell rings on the BGM downbeat. Platform spawns and Byrna's four patterns are
frame-locked to it. This stage is played by ear.

**Ship the visual pulse accessibility option, default ON** — a screen-edge flash on each
bell. Players who cannot rely on audio must not be locked out.

Also: ice + fixed jump arc is the hardest combination in the game. Keep 3-A's pit count
low and lean on damage instead.

## Boss design rules

Every boss: 3 phases, 4–6 patterns, weighted rotation (same pattern max twice in a row),
distinct windup silhouette, guaranteed dodge route, clearable with any weapon.
Target: 3–5 min first attempt, 60–90s once learned.

- **Morg & Mag**: killing one enrages the other (1.6× speed, fire, 2 new patterns).
  The correct play is to damage both evenly — show both HP bars to hint it.
- **Byrna**: patterns cycle on the bell, so the fight is the stage's lesson as a test.
- **Muck**: 3 heads with separate HP; killed heads revive at half HP after 8s.

## Enemy density

Never exceed the per-stage caps in `docs/05` section 5.5. In pixel art, a crowded screen
doesn't hide enemies — it hides **projectiles**, which is where unfair deaths come from.

## Done

Stages 1–4 play continuously. Per-section death counts land in the `docs/08` §8.3 targets.
