Prototype the Phantasm variant of **Stage 1 only**. Do not build stages 5–6 yet.

Read `docs/08-progression-difficulty.md` section 8.2 and `docs/06-visual-direction.md`
section 6.7.

## Why this comes first

The second loop is the project's biggest content bet: it doubles the game's volume using
almost no new assets. If it reads as a recolored rerun, the entire M3 plan changes — and
you need to know that before building two more stages on the assumption.

## Build

| Technique | Effect |
|---|---|
| HSV + luma inversion | teal graveyard → orange graveyard. Same tiles, different place |
| UV mirroring on background layers | familiar-but-wrong |
| Afterimage accumulation | frame blending on all motion |
| Scan glitch | horizontal tear sweeps the screen every 8s |
| Particle inversion | falling particles rise |
| Re-placed enemies | familiar spots, different enemies |
| Grimm ×2 | some activate immediately |

Density rises to 4.0 average / 10 max. Time limit drops to 4 minutes.

## Then ask testers one question

> **"Does this feel like new content, or the same stage recolored?"**

| Result | Action |
|---|---|
| ≥60% say new content | proceed to stages 5–6 |
| under 60% | **stop and add terrain rework to the plan** |

Terrain rework means physically re-cutting platform layouts, not just shaders — roughly
+2 weeks per stage. Better to learn that now than after building six.

## Done

Stage 1 Phantasm is playable end to end, and the tester verdict is recorded with a
decision either way.
