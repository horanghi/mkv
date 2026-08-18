Implement the sprite system.

Read `docs/12-sprites.md` — all matrices and part data are there, ready to copy.

## Loader

Dot matrices are string arrays. **Validate every row is exactly 32 characters on load.**
One wrong character silently shifts everything below it.

## Part assembly

Implement `pose()` exactly as specced in section 12.6. Parts are stamped by offset —
never redraw a frame by hand.

Draw order, back to front:

```
ARM_B → LEG_B → BOOT_B → PLUME → TORSO → HEAD → LEG_F → BOOT_F → ARM_F
```

Wrong order puts the front arm behind the torso.

## Two swap axes

| Swap | What changes | What stays |
|---|---|---|
| Palette | relic ↔ steel | matrix, clips |
| Part set | armored ↔ bare ↔ bones | clips |

Clip data is shared across all states. That is the whole point of the parts approach —
adding a state must not require re-animating anything.

## Clips

All five from section 12.6: `idle`(2f), `walk`(8f), `jump`(4f), `attack`(4f), `crouch`(2f).
Weapons appear only during `attack`; the projectile entity spawns on frame 2.

## Rendering

- Logical 480×270, integer scale only
- Tiles and characters snap to the pixel grid; particles and shaders do not

## Done

Lancel animates in all four states using identical clip data, and switching state
mid-animation does not reset or glitch the frame index.
