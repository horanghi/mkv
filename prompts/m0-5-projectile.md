Add the lance projectile. One weapon only — the rest come in M2.

Read `docs/03-weapons-magic.md` section 3.2.

## Lance

```
damage 10    fire interval 20f    speed 320px/s    straight line
max 2 on screen    fire delay 3f    recovery 8f (movement still allowed)
```

The 2-projectile cap is a series rule, not a performance limit. It forces the player to
commit to each throw.

## Firing directions

Reuse the attack directions from the movement step: horizontal, up, crouched, and
down-in-air. The projectile spawns at the hand position for each.

## Visuals

Coloured rectangles. No sprites yet — this is still grey-box.

## Done

- Firing feels responsive (total input-to-visible latency ≤ 2 frames)
- The 2-projectile cap is enforced and visible in the debug overlay
- Recovery does not lock movement
