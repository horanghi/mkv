Implement the four difficulty modes.

Read `docs/08-progression-difficulty.md` section 8.4.

| Mode | Target | Changes |
|---|---|---|
| Squire | newcomers | +1 armor tier, 8min limit, 3 checkpoints, Grimm −30% |
| **Knight** | default | baseline spec |
| Paladin | veterans | 1 checkpoint, 4min limit, density +25%, no-hit bonus ×2 |
| Penance | challenge | 1 life, no continues. Clear unlocks an exclusive skin |

## What may be adjusted

Checkpoints, time limit, lives, enemy density, Grimm frequency.

## What may NOT be adjusted

Enemy HP, damage values, boss patterns, phase count.

A player who clears on Squire must be able to say they played the same game. The gap
between modes is **patience, not skill** — never remove content to make it easier.

## Mode switching

- Changeable any time, including mid-stage
- No warning, no penalty for lowering
- Achievements and rankings recorded per mode
- **The true ending is reachable on Squire.** Do not gate the story behind difficulty.

## Also implement

Score → rank (S/A/B/C) per `docs/02` section 2.7, and the results screen from
`docs/09` section 9.4 — sequential score rolling over 2.5s, skippable with any key,
stamp animation with hitstop and shake on rank reveal.

## Done

All four modes playable. Verified that no mode alters enemy HP or boss patterns.
