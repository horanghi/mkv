Implement all seven weapons.

Read `docs/03-weapons-magic.md` section 3.2. **Balance numbers come from that table —
do not invent values.**

| Weapon | Damage | Interval | Speed | Arc | Note |
|---|---|---|---|---|---|
| Lance | 10 | 20f | 320 | straight | already built |
| Dagger | 6 | 10f | 400 | straight | 3 on screen, not 2 |
| Torch | 8 + 4/s | 30f | 200 | arc | 3s fire pool |
| Axe | 22 | 36f | 240 | arc | highest single hit |
| Cross | 14 | 28f | 280 | pierce | 1.5× vs undead |
| Discus | 9 | 24f | 300 | bounce | max 4 bounces |
| Hammer | 16 | 32f | 260 | arc | landing shockwave r40, 12dmg |

## Design rules

**No weapon may be a trap.** The original's torch was famously a run-ender; here it is a
zone-control tool — the fire pool flows along terrain and blocks corridors, spawn points,
and boss paths. Treat that redesign as intentional.

**No weapon may be strictly best.** Every one needs a clear weakness:
dagger can't break armored enemies, axe is useless up close, torch does nothing to
flyers, discus wastes itself in open space, hammer's shockwave can't cross height changes.

## The 3-second undo — do not skip this

When the player picks up a weapon, the previous one stays on the ground for 3 seconds.

Stepping on an unwanted weapon and ruining a run was the single most common quit trigger
in the original. This is not a convenience feature; it removes a known failure mode.

## Trap chests

Some chests contain a Wizard who transforms Lancel:

| Form | Duration | Effect |
|---|---|---|
| Frog | 8s | cannot attack, jump only, 50% speed |
| Old man | 8s | 40% speed, attacks still work |

Keep the infamous mechanic, but **show the countdown timer on the HUD**. Unfair becomes
tense once the player can see the end coming.

## Done

Playtesters report no weapon they would never pick. Weapon swap undo works within 3s.
