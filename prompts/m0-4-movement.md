Implement Lancel's movement and jump.

Read `docs/02-core-mechanics.md` and use its numbers verbatim.

## Numbers

```
run 110px/s     accel 900px/s²    decel 1400px/s²    air accel 0
jump -420px/s   gravity 1500 rising / 1750 falling   max fall 480px/s
coyote 5f       jump buffer 6f    corner correction 3px    landing grip 2f
hitbox 12×26    crouching 12×16
```

## The fixed jump arc — do not "fix" this

Horizontal speed at takeoff is held until landing. **Pressing left or right mid-air
changes nothing.** This is not a bug and not an oversight — every level in the game is
designed on top of this rule, and "read the level before you jump" is the core loop.

Also: **no variable jump height.** A button tap and a button hold produce the same arc.
Low-ceiling sections are solved by level geometry, not by input nuance.

The forgiveness devices above (coyote, buffer, corner correction) exist to remove
*unfair* failures. They do not soften the arc rule.

## Attack directions

- attack → horizontal
- up + attack → vertical up (recovery 12f, longer than normal, to prevent spam)
- down + attack on ground → crouched horizontal
- down + attack midair → vertical down

Up/down attacks were impossible in the original. That was unfairness, not difficulty.

## Build a calibration level

A row of gaps at 3.0, 3.5, 3.9, and 4.2 tiles. Measure the real max jump distance
empirically rather than trusting the math.

## Done

Debug overlay draws the jump arc. Measured max distance matches the spec within 1px.
Numbers are then frozen and treated as spec — update `docs/02` if any change.
