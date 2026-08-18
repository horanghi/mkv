Final polish and ship.

Read `docs/08-progression-difficulty.md` section 8.6 and `docs/09-ui-ux-controls.md`
section 9.5.

## Balance

Verify per-section death counts land in the `docs/08` §8.3 targets.

```
S1  0-2     S2  3-5     S3  5-8     S4  4-7
S5  8-12    S6 10-15    Phantasm 30-50
first loop total: 35-55 deaths
```

If more than 30% of players die in Stage 1, the tutorial failed — redesign it rather
than tuning numbers.

Clear-rate targets: S1 85%, S3 reach 60%, S6 reach 25%, first loop 15%, Phantasm 5%.

## Performance

Validate all three quality tiers on **real** low-end hardware, not a throttled profile.

| Target | Result |
|---|---|
| M1 MacBook Air | 1080p60 high |
| GTX 1050 laptop | 1080p60 high |
| Intel integrated (2019) | 1080p60 medium |
| below that | 720p60 low |

## Accessibility — flash reduction is a safety feature

This game uses whiteouts and lightning heavily. Photosensitive epilepsy risk is not a
nice-to-have; ship it working.

- Flash reduction: caps whiteout and lightning intensity at 50%
- Screen shake: 0–100% scale
- Colorblind support: shape markers on enemies and projectiles, 3 presets
- Rhythm visual pulse (Stage 3), default ON
- Full key remapping, one-handed preset, hold→toggle

## Save data

localStorage is fragile — browser data clearing wipes progress.

- Export/import progress as a base64 code
- Warn once, on first clear, that clearing browser data erases saves

## Unlocks

8 armor skins, weapon skins, gallery + sound test (12 relic fragments), boss rush
(first clear), Galahad playable (true ending).

## Deploy

Vercel production, custom domain, OG image, meta tags, loading optimization.

## Done

Zero crashes across 10 hours of continuous play. All target metrics met.
20 external testers have completed a run.
