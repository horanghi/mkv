/**
 * 품질 티어.
 *
 * 프레임이 무너지면 스스로 낮춘다. **다만 사용자가 직접 고른 뒤에는 건드리지 않는다** —
 * 자동 조정이 사용자 선택을 덮어쓰면 "설정이 멋대로 바뀐다"가 된다.
 * → docs/06-visual-direction.md 6.4 · docs/10-tech-spec.md 10.8
 */

export const QUALITY_TIERS = ['low', 'medium', 'high'] as const
export type Quality = (typeof QUALITY_TIERS)[number]

export interface QualityFeatures {
  readonly dynamicLights: boolean
  readonly maxLights: number
  readonly bloom: boolean
  /** 왜곡 강도 배율 [0,1] */
  readonly distortion: number
  readonly grain: boolean
  readonly maxParticles: number
}

const FEATURES: Readonly<Record<Quality, QualityFeatures>> = {
  low: {
    dynamicLights: false, maxLights: 0, bloom: false,
    distortion: 0, grain: false, maxParticles: 150,
  },
  medium: {
    dynamicLights: true, maxLights: 16, bloom: true,
    distortion: 0.5, grain: true, maxParticles: 400,
  },
  high: {
    dynamicLights: true, maxLights: 32, bloom: true,
    distortion: 1, grain: true, maxParticles: 800,
  },
}

export function featuresFor(tier: Quality): QualityFeatures {
  return FEATURES[tier]
}

export interface QualityState {
  readonly tier: Quality
  /** 사용자가 직접 골랐는가. 그렇다면 자동 조정을 멈춘다. */
  readonly manual: boolean
  /** 30fps 미만이 이어진 시간 */
  readonly belowMs: number
  /** 60fps 가 안정적으로 유지된 시간 */
  readonly stableMs: number
  /** 자동 강등 안내를 이미 보여줬는가. 한 번만 띄운다. */
  readonly notified: boolean
}

export const DOWNGRADE_FPS = 30
export const DOWNGRADE_AFTER_MS = 3000
export const UPGRADE_FPS = 58
export const UPGRADE_AFTER_MS = 5000

export function createQuality(tier: Quality = 'medium'): QualityState {
  return { tier, manual: false, belowMs: 0, stableMs: 0, notified: false }
}

export interface QualityChange {
  readonly state: QualityState
  readonly downgraded: boolean
  readonly upgraded: boolean
  /** 이번에 안내를 띄워야 하는가. 자동 강등 첫 회에만 참이다. */
  readonly notify: boolean
}

/**
 * 프레임 상황을 보고 티어를 조정한다.
 *
 * 강등은 3초, 승격은 5초를 기다린다. 승격을 더 느리게 두는 이유는
 * 경계에서 오르내리며 화면이 깜빡이는 것을 막기 위해서다.
 */
export function observeFps(state: QualityState, fps: number, dtMs: number): QualityChange {
  const unchanged: QualityChange = { state, downgraded: false, upgraded: false, notify: false }
  if (state.manual) return unchanged

  const step = Math.max(0, dtMs)
  const belowMs = fps < DOWNGRADE_FPS ? state.belowMs + step : 0
  const stableMs = fps >= UPGRADE_FPS ? state.stableMs + step : 0

  if (belowMs >= DOWNGRADE_AFTER_MS) {
    const lower = downgrade(state.tier)
    if (lower !== state.tier) {
      return {
        state: { ...state, tier: lower, belowMs: 0, stableMs: 0, notified: true },
        downgraded: true,
        upgraded: false,
        notify: !state.notified,
      }
    }
  }

  if (stableMs >= UPGRADE_AFTER_MS) {
    const higher = upgrade(state.tier)
    if (higher !== state.tier) {
      return {
        state: { ...state, tier: higher, belowMs: 0, stableMs: 0 },
        downgraded: false,
        upgraded: true,
        notify: false,
      }
    }
  }

  return { state: { ...state, belowMs, stableMs }, downgraded: false, upgraded: false, notify: false }
}

/** 사용자가 직접 고른다. 이후 자동 조정은 멈춘다. */
export function setManual(state: QualityState, tier: Quality): QualityState {
  return { ...state, tier, manual: true, belowMs: 0, stableMs: 0 }
}

/** 자동 조정을 다시 켠다. */
export function clearManual(state: QualityState): QualityState {
  return { ...state, manual: false, belowMs: 0, stableMs: 0 }
}

function downgrade(tier: Quality): Quality {
  const index = QUALITY_TIERS.indexOf(tier)
  return QUALITY_TIERS[Math.max(0, index - 1)] ?? tier
}

function upgrade(tier: Quality): Quality {
  const index = QUALITY_TIERS.indexOf(tier)
  return QUALITY_TIERS[Math.min(QUALITY_TIERS.length - 1, index + 1)] ?? tier
}
