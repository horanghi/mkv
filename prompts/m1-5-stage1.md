Build Stage 1 — the Weeping Graveyard — and its boss.

Read `docs/04-stages.md`, `docs/05-enemies-bosses.md`, and `docs/12-sprites.md`.

## Level pipeline

Tiled `.tmj` loader, 8 parallax layers per `docs/06` section 6.2.

**Background must never be mistakable for a platform.** Backgrounds stay dark and
desaturated; only walkable tiles are bright. Getting this wrong ruins the game.

## Sections

| Section | Content |
|---|---|
| 1-A | Flat ground, 3 ghouls, first jump, first weapon chest. **Death must be impossible here.** |
| 1-B | Crumbling gravestones (collapse 1s after contact), first Grimm |
| Boss | Cairn — 3 phases |

The 1-B entrance is deliberately arranged so a first-timer takes a hit. The player needs
to see the armor-break sequence early — it is the game's selling point.

## Enemies

Sprites and palettes are in `docs/12-sprites.md` sections 12.8–12.9.

| Enemy | HP | Behavior |
|---|---|---|
| Ghoul | 20 | Rises from ground, walks straight, slow (4fps animation) |
| Grimm | 30 | See rules below |
| Corvid | 12 | Waits, dives when the player passes below, cannot change course mid-dive |

## Grimm rules are non-negotiable

- **Never spawns off-screen.** Always visible in a dormant state on a wall or ceiling first.
- Activates when the player enters a 120px radius
- Sine-wave pursuit toward the player at 90px/s
- **Freezes for 3 seconds on landing** — the only guaranteed window to kill it

Grimm exists to force the player to check before jumping. If it can appear from nowhere,
it stops teaching and starts cheating.

## Boss — Cairn (HP 300)

| Phase | Patterns |
|---|---|
| 1 | Arm slam (30f windup), gravestone throw (2 arcs) |
| 2 | + ground pound → 3 falling rocks, summon 3 ghouls |
| 3 | + body splits into 4 homing fragments, then reforms |

Weak point: the glowing chest core. Other hits deal 50% damage.
Every pattern needs a distinct windup silhouette and a guaranteed dodge route.

## Checkpoints

2 per stage, ≤90 seconds apart. Boss deaths restart at the pre-boss checkpoint —
never replay the run-up.

## Done

Stage 1 is clearable start to finish, and a first-time player sees the armor-break
sequence within the first two minutes.
