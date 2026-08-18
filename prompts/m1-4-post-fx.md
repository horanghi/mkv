Implement the post-processing stack.

Read `docs/10-tech-spec.md` section 10.5 and `docs/06-visual-direction.md` section 6.4.

## Pipeline

```
1. scene (layers 1-7)        → colorRT     480×270
2. emissive objects only     → emissiveRT  480×270
3. light accumulation        → lightRT     240×135
4. colorRT × lightRT         → litRT
5. emissiveRT → bloom ×3     → bloomRT     240×135 → 120×68 → 60×34
6. litRT + bloomRT additive  → composedRT
7. distortion, aberration, vignette, grain → screen
```

## Bloom reads an emissive mask, never the full color buffer

Global bloom on pixel art turns the screen to mush. Only things that should glow get a
bloom pass: fire, magic, phosphorescence, the relic armor.

```
threshold 0.75    3-pass gaussian    intensity 1.2
```

## 2D dynamic lighting

Normal maps on tilesets and characters, point lights with radius/color/intensity/flicker.
Max 16 simultaneous (8/16/32 by quality tier). No shadow casting — poor cost/benefit in 2D.

Light sources: torch weapon, fire pools, sigils, boss attacks, stage ambient, **and the
relic armor itself**.

## Chromatic aberration — event-only, never constant

| Event | Max | Duration |
|---|---|---|
| armor break | 0.8 | 140ms |
| boss entrance | 1.2 | 600ms |
| sigil cast | 0.5 | 200ms |
| phase transition | 1.5 | 800ms |

## All post-processing at logical resolution

Process at 480×270, upscale last with nearest-neighbor at integer scale. Post-processing
at 1080p costs 16× per pixel for no visible gain. Non-integer window sizes get letterboxed.

## Quality tiers

| Tier | Trigger | Disabled |
|---|---|---|
| low | under 30fps for 3s | dynamic lights, bloom, distortion, grain |
| medium | default | reduced distortion, 400 particles |
| high | 60fps stable 5s | everything |

Auto-downgrade shows one quiet toast, then respects manual settings.

## Done

60fps at 1080p on a mid-tier laptop at quality=high. Frame budget: logic 4ms, batching
3ms, GPU scene 4ms, GPU post 4ms.
