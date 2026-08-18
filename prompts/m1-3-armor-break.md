Implement the armor-break sequence.

Read `docs/06-visual-direction.md` section 6.3.

**This is the most important 300ms in the game.** The player just lost their armor and
should feel "that looked incredible" instead of "that was cheap". Budget real effort here.

## Frame timeline

| t | Event |
|---|---|
| 0ms | Hitstop 180ms begins — logic frozen, input buffer still collecting |
| 0–40 | Full-sprite white additive flash, alpha 1.0 → 0.6 |
| 40 | **24 shards spawn, sampled from the actual sprite pixels** |
| 40 | Radial flash ring, radius 8 → 96px over 0.14s |
| 40–180 | Chromatic aberration 0 → 0.8 → 0 (RGB split up to 3px) |
| 60 | One-frame full-screen invert (16ms) |
| 100 | Camera shake 6px, 300ms ease-out decay, 28Hz |
| 180 | Hitstop ends. Bare sprite + 1.2s invuln blink |
| 180–3000 | Shards rest on the ground, then fade |

## Shard sampling — do not use generic particles

```ts
const armorPixels = matrix.flatMap((row, y) =>
  [...row].map((ch, x) => '1234'.includes(ch) ? { x, y, color: palette[ch] } : null)
).filter(Boolean)
```

Pick 24 at random from that set. The debris must visibly be the armor that just broke,
in its actual colors, launched from its actual position.

Shard physics: initial 120–260px/s outward from the hit, rotation, gravity, ground bounce
with 0.36 restitution.

## Why shards persist for 3 seconds

They are physical evidence of what happened there. When the player walks back through
that spot on the retry, the debris is still lying there. That is free storytelling.

## Death sequence

When hit while bare — see section 6.3:

```
0ms     hitstop 250ms
0–250   skeletonization, 8 frames
250     slow motion 0.3× for 1s, 12 bone fragments, shake 10px, saturation → 0
1250    fade → respawn
```

Total under 1.25s, and respawn-to-playable stays under the 3-second budget.

## Done

Frame timings verified with the frame-step dev tool. Shards visibly originate from the
armor. Death → playable measured under 3 seconds.
