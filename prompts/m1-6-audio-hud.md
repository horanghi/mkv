Add adaptive audio and the HUD.

Read `docs/07-audio.md` and `docs/09-ui-ux-controls.md`.

## Adaptive BGM

Each stage track ships as **4 stems** — rhythm, bass, melody, chorus — mixed by gain at
runtime. No crossfades, no seams, near-zero CPU.

| Armor state | Mix |
|---|---|
| relic | base + chorus layer |
| steel | base |
| bare | 800Hz lowpass + heartbeat sub, chorus muted |
| under 30s left | tempo +12%, percussion layer |

## Ducking

| Trigger | Target | Amount | Recovery |
|---|---|---|---|
| armor break | BGM | −9dB | 0.6s |
| death | BGM + ambience | −18dB | 1.2s |
| boss entrance | everything | → **0.3s of silence** | boss theme starts |

That 0.3s of silence before a boss is the cheapest, strongest effect in the game. When
sound disappears, people look at the screen.

## Preloading

Boss BGM loads 30 seconds before the boss room. **Never stall at the door** — a loading
hitch there destroys the moment.

## HUD

Only four persistent elements: lives, current weapon, time, score.

- **Armor state is NOT on the HUD.** The sprite is the health bar. The player should be
  looking at their character, not the corner.
- No transparency — translucent HUD on pixel art looks muddy
- Conditional elements: sigil cooldown (relic only), transform timer, boss HP
- Auto-dim to 60% alpha after 3s of no events and no enemies

## Death → respawn timeline

```
0.00s  death, hitstop 250ms
0.25s  skeletonize + slow motion 1s
1.25s  fade out 0.3s
1.55s  move to checkpoint, fade in 0.3s
1.85s  respawn i-frames, PLAYABLE
```

Game-over screen appears **only** when lives hit zero. With lives remaining, no UI
interrupts the retry.

## Done

Initial load under 8MB. Audio state follows armor state with no audible seam. Measured
death-to-playable under 3 seconds.
