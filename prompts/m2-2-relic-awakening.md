Implement the three relic armors, 21 weapon awakenings, and three sigils.

Read `docs/03-weapons-magic.md` sections 3.3–3.4.

## Relic armors

| Armor | Sigil | Awakening direction |
|---|---|---|
| Gold | Radiance | firepower |
| Silver | Aegis | defense / utility |
| Crystal | Rift | speed |

Each must be identifiable instantly: gold lights the room, silver sheds frost particles,
crystal leaves afterimages.

## 21 awakenings — hard budget

7 weapons × 3 armors. Full tables are in section 3.3.

**At most 5 unique new sprites across all 21.** Everything else is palette swap plus
particle change.

This is the biggest schedule risk in M2. If a design needs a sixth unique sprite, change
the design, not the budget. Report it rather than silently exceeding.

## Sigils

12s cooldown, reset on stage transition, relic-only.

| Sigil | Effect | Presentation |
|---|---|---|
| Radiance | screen flash 0.4s, mobs die, boss takes 40 + 2s stagger | full whiteout → silhouettes → return, bloom threshold → 0 |
| Aegis | 3s invuln barrier, reflects projectiles back at the shooter | hex crystal barrier + refraction shader |
| Rift | 4s, enemies and projectiles at 30% speed | desaturation + time afterimages + audio lowpass |

## Done

All 21 combinations function. Unique sprite count ≤ 5, verified by counting the atlas.
