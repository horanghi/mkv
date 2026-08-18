Build stages 5 and 6, plus Galahad and Asmodeus.

Read `docs/04-stages.md` and `docs/05-enemies-bosses.md`.

## Stage 5 — The Hanging Gaol

The only **vertical scrolling** stage. Camera and level streaming both need new handling.

- 5-A ascent: swaying chain platforms, rising darkness below (instant death on contact)
- 5-B descent: free fall with obstacle avoidance, camera locked downward
- Lightning fills the screen white every 3–7s. **The real background — hanging corpses —
  is only visible during those flashes.**

## Galahad (HP 400) — the story's peak

An executed paladin wearing the same relic armor as Lancel.

**He uses whatever weapon the player is currently holding.** The player fights themselves.

| Phase | Change |
|---|---|
| 1 | identical movement, jump, and attack rules as the player |
| 2 | armor shatters — **using the player's own armor-break sequence** — speed ×1.4 |
| 3 | bare, desperate, unpredictable, close-range |

Reusing the player's break sequence on an enemy inverts its meaning. No dialogue is
needed, and none should be added.

On defeat: he kneels, looks up at Lancel, three seconds of silence, then crumbles to ash.
Drop: Galahad's helm — raises relic armor drop rate (cosmetic slot).

## Stage 6 — Throne of Ashes

Every prior gimmick combined.

- 6-A: rising lava + collapsing bridges (stage 2 and 4 gimmicks merged)
- 6-B: boss rush — shrunken versions of bosses 1–3 back to back → throne

## Asmodeus (HP 700) — 4 phases

| Phase | Stage | Patterns |
|---|---|---|
| 1 | before the throne | fire breath, claw sweep, summon 4 cinders |
| 2 | airborne | screen-wide falling debris, homing fireballs, charge |
| 3 | **arena collapses, 3 platforms remain** | platform-destroying attacks, rising lava |
| 4 | true form, half the screen | all patterns accelerated + one screen-wide attack with a single safe spot |

Each phase transition gets a 0.8s screen-transition cut. This is the game's biggest
spectacle sequence — budget accordingly.

On defeat: the screen warps →

> *"이 마을은 처음부터 존재하지 않았다."*

→ forced entry into the Phantasm loop.

## Done

Stages 1–6 clearable in sequence, and the Phantasm transition triggers correctly.
