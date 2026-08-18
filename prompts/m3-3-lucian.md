Implement Lucian, the true final boss, and the cross gate.

Read `docs/05-enemies-bosses.md` and `docs/08-progression-difficulty.md` section 8.2.

## Lucian (HP 900) — 5 phases, Phantasm loop only

| Phase | Content |
|---|---|
| 1 | uses Asmodeus's patterns verbatim — he was the illusion |
| 2 | randomly borrows patterns from bosses 1–5 |
| 3 | **screen inversion** — left/right controls reversed for 30s |
| 4 | summons 3 shadows of Lancel that mimic the player's input on a 1s delay |
| 5 | true form, full screen, **no patterns** |

## Phase 5 is not a dodge fight

Lancel and Lucian lock beams and push against each other. The player mashes to drive a
gauge; failure is instant death. This is the climax of the entire game — it should feel
like a contest of will, not a pattern check.

## Cross gate — keep the tradition, remove the trap

**Only cross-type weapons damage Lucian.** This is series canon since 1985; keep it.

But the original's version of this rule was infamous for stranding players. Ship all
three safeguards:

1. A large cross mural at the Stage 6 Phantasm entrance
2. A visible marker on the final door — "will not open without the relic"
3. **If the player reaches the final area without a cross, force-spawn a cross chest at
   the previous checkpoint**

Tradition is preserved. The trap is not.

## Phantasm weapons

Seven shadow variants, obtainable only in the second loop — see `docs/08` section 8.2.
Notable: the Inverted Cross deals double damage but chips Lancel on each throw;
the Shatter Hammer breaks terrain, opening hidden routes.

## Endings

- First loop: Asmodeus defeated → reach Isolde → reality warps → forced second loop
- True ending: Lucian defeated → the truth of Grimhollow revealed

No cutscenes. Environmental storytelling and boss presentation carry it.

## Done

True ending reachable. Zero players get stuck at the cross gate in testing.
