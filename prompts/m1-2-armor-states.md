Implement the armor state machine.

Read `docs/02-core-mechanics.md` section 2.5.

## Chain

```
relic (HP3) → steel (HP2) → bare (HP1) → death
```

- **Relic**: max one per stage, from a chest. Grants weapon awakening + sigil access.
  It also emits light — in dark stages the player's armor is their lantern, so losing it
  literally darkens the world.
- **Steel**: starting state.
- **Bare**: move speed +8%. Fear makes the legs faster.

## Invulnerability

| Event | Frames |
|---|---|
| after hit | 72 (1.2s), blink every 4f |
| relic pickup | 30 |
| respawn | 90 |

## Rules

- Pit falls are **instant death** regardless of armor state
- Armor state is never shown on the HUD — the sprite is the health bar
- A hit landing during i-frames does nothing (no queued damage)

## Lives and continues

```
start lives 3    1UP: max one per stage, hidden
lives 0 → game over → unlimited continues, restart at last checkpoint
continue resets lives to 3 AND resets the weapon to lance (the penalty)
```

## Done

State transitions are covered by tests including hit-during-i-frames and
pit-death-while-relic. No path lets the player skip a state.
