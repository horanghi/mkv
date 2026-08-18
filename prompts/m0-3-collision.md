Implement AABB tile collision.

Read `docs/10-tech-spec.md` section 10.4 first.

## Spec

- **Broadphase**: query only the tiles the entity AABB overlaps. No spatial partitioning
  yet — max ~30 entities makes brute force correct. Add it only after profiling says so.
- **Narrowphase**: resolve X axis first, then Y. Separate axis resolution.
- **Substepping**: when per-tick movement exceeds one tile (16px), split the move.
- **One-way platforms**: collide only when falling AND the previous frame was fully above.
- **Crumbling tiles**: collision disabled N ticks after contact, with a visual warning
  that starts before the player commits to the jump.
- **No slopes.** Slopes in pixel-art platformers are a bug farm; the level design avoids them.

## Entity pairs

| Pair | Behavior |
|---|---|
| player ↔ enemy | AABB overlap → damage (unless i-frames) |
| projectile ↔ enemy | overlap → damage + despawn |
| projectile ↔ tile | per-weapon: pierce / bounce / despawn |
| enemy ↔ enemy | **no collision** — overlapping is fine |

## Style

Immutable: `resolve(body, tilemap, dt)` returns a new body. Never mutate in place.

## Done

Unit tests cover exact-corner entry, high-speed tunneling, and one-way approach from
below. Coverage on `physics/` ≥ 95%.
