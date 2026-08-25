/**
 * SFX 레이어 명세.
 *
 * docs/07 7.5 가 중요 SFX 를 **여러 레이어의 합성**으로 규정한다.
 * 오실레이터 하나로는 "금속이 터지고 저역이 때리고 파편이 떨어지는" 소리가
 * 안 나온다 — 그건 세 개의 다른 사건이다.
 *
 * 순수 데이터다. 소리를 내는 것은 `core/sfx.ts` 다.
 */

export type SfxName =
  | 'jump' | 'land' | 'throw' | 'hit' | 'enemyDie'
  | 'armorBreak' | 'death' | 'relic' | 'bossHit' | 'quake'
  | 'grimmTakeoff' | 'menu' | 'clear'

/** 오실레이터 파형, 또는 노이즈. */
export type Source = OscillatorType | 'noise'

export interface SfxLayer {
  /** 소리 시작으로부터의 지연 (ms). 레이어 사이의 시간차가 곧 연출이다 */
  readonly delayMs: number
  readonly hz: number
  /** 끝 주파수. 없으면 고정 */
  readonly toHz?: number
  readonly ms: number
  readonly source: Source
  readonly gain: number
  /** 밴드패스 중심 (Hz). 노이즈를 금속·파편으로 만든다 */
  readonly filterHz?: number
  /** 밴드패스 Q. 클수록 좁고 금속적이다 */
  readonly q?: number
  /** 반복 횟수. 파편이 우수수 떨어지는 것 */
  readonly repeat?: number
  /** 반복 간격의 흔들림 (ms) */
  readonly repeatSpreadMs?: number
}

export interface SfxSpec {
  readonly layers: readonly SfxLayer[]
}

/**
 * 갑옷 파괴 — **이 게임의 시그니처 사운드.**
 *
 * docs/07 7.5 의 타이밍 그대로다: t=0 금속 파열(고역), t=40ms 저역 임팩트(50Hz),
 * t=180ms 파편 낙하. 비주얼(`fx/sequence.ts` ARMOR_BREAK)과 프레임 단위로 맞춘다.
 */
const ARMOR_BREAK: SfxSpec = {
  layers: [
    // ① 금속 파열 — 좁은 밴드패스가 걸린 노이즈가 금속으로 들린다
    // 밴드패스가 좁을수록 에너지가 깎인다. 게인은 필터 뒤에서 들리는 크기 기준으로 잡았다.
    { delayMs: 0, hz: 0, ms: 260, source: 'noise', gain: 0.42, filterHz: 3200, q: 1.8 },
    { delayMs: 0, hz: 1750, toHz: 620, ms: 180, source: 'sawtooth', gain: 0.18 },
    // ② 저역 임팩트 — 몸으로 느끼는 부분
    { delayMs: 40, hz: 90, toHz: 42, ms: 420, source: 'sine', gain: 0.42 },
    // ③ 파편 낙하 — 여러 조각이 시차를 두고 떨어진다
    {
      delayMs: 180, hz: 0, ms: 70, source: 'noise', gain: 0.30,
      filterHz: 4600, q: 2.4, repeat: 7, repeatSpreadMs: 85,
    },
  ],
}

/**
 * 사망 (백골화) — **일부러 코믹하게.**
 *
 * docs/07 7.5: "잔혹하게 만들면 반복 사망이 견디기 힘들어진다."
 * 원작의 톤이 그랬다. 미끄러지듯 떨어지는 음정과 딱딱한 뼈 소리로 만든다.
 */
const DEATH: SfxSpec = {
  layers: [
    // 미끄러지는 음 — 만화적인 낙하
    { delayMs: 0, hz: 640, toHz: 110, ms: 520, source: 'triangle', gain: 0.26 },
    // 살점이 벗겨지는 소리. 짧고 건조하게 — 길게 끌면 잔혹해진다
    { delayMs: 60, hz: 0, ms: 150, source: 'noise', gain: 0.16, filterHz: 900, q: 1.2 },
    // 뼈가 부딪히는 소리. 딱딱 두 번
    {
      delayMs: 320, hz: 0, ms: 45, source: 'noise', gain: 0.2,
      filterHz: 2400, q: 6, repeat: 3, repeatSpreadMs: 70,
    },
  ],
}

/**
 * 그림 이륙 — **고유하고 날카롭게.**
 *
 * docs/07 7.5: "이 소리가 들리면 즉시 위치를 확인하게 만드는 것이 목표."
 * 다른 어떤 소리와도 겹치지 않는 상승 음정으로 잡았다.
 */
const GRIMM_TAKEOFF: SfxSpec = {
  layers: [
    { delayMs: 0, hz: 380, toHz: 1500, ms: 220, source: 'square', gain: 0.16 },
    { delayMs: 30, hz: 760, toHz: 2600, ms: 190, source: 'sawtooth', gain: 0.08 },
    { delayMs: 0, hz: 0, ms: 120, source: 'noise', gain: 0.06, filterHz: 4200, q: 8 },
  ],
}

/** 한 겹짜리 소리를 짧게 적는다. `toHz` 를 주면 미끄러진다. */
function simple(hz: number, ms: number, source: Source, gain: number, toHz?: number): SfxSpec {
  const layer: SfxLayer = toHz === undefined
    ? { delayMs: 0, hz, ms, source, gain }
    : { delayMs: 0, hz, toHz, ms, source, gain }
  return { layers: [layer] }
}

export const SFX_SPECS: Readonly<Record<SfxName, SfxSpec>> = {
  jump: simple(320, 90, 'square', 0.10, 620),
  land: {
    layers: [
      { delayMs: 0, hz: 180, toHz: 90, ms: 70, source: 'triangle', gain: 0.08 },
      { delayMs: 0, hz: 0, ms: 55, source: 'noise', gain: 0.05, filterHz: 1400, q: 1 },
    ],
  },
  throw: simple(700, 70, 'sawtooth', 0.07, 380),
  hit: {
    layers: [
      { delayMs: 0, hz: 220, toHz: 120, ms: 90, source: 'square', gain: 0.12 },
      { delayMs: 0, hz: 0, ms: 80, source: 'noise', gain: 0.09, filterHz: 1800, q: 1.5 },
    ],
  },
  enemyDie: {
    layers: [
      { delayMs: 0, hz: 260, toHz: 70, ms: 180, source: 'sawtooth', gain: 0.11 },
      { delayMs: 20, hz: 0, ms: 140, source: 'noise', gain: 0.08, filterHz: 1100, q: 1.2 },
    ],
  },
  armorBreak: ARMOR_BREAK,
  death: DEATH,
  relic: {
    layers: [
      { delayMs: 0, hz: 520, toHz: 1040, ms: 320, source: 'sine', gain: 0.12 },
      { delayMs: 90, hz: 1040, toHz: 1560, ms: 340, source: 'sine', gain: 0.07 },
    ],
  },
  bossHit: {
    layers: [
      { delayMs: 0, hz: 150, toHz: 90, ms: 120, source: 'square', gain: 0.13 },
      { delayMs: 0, hz: 0, ms: 110, source: 'noise', gain: 0.1, filterHz: 900, q: 2 },
    ],
  },
  quake: {
    layers: [
      { delayMs: 0, hz: 90, toHz: 40, ms: 420, source: 'sine', gain: 0.28 },
      { delayMs: 40, hz: 0, ms: 380, source: 'noise', gain: 0.12, filterHz: 260, q: 0.8 },
    ],
  },
  grimmTakeoff: GRIMM_TAKEOFF,
  // UI — BGM 더킹 대상이 아니다. → docs/07 7.6
  menu: simple(520, 45, 'square', 0.06),
  clear: {
    layers: [
      { delayMs: 0, hz: 523.25, ms: 160, source: 'triangle', gain: 0.12 },
      { delayMs: 130, hz: 659.25, ms: 160, source: 'triangle', gain: 0.12 },
      { delayMs: 260, hz: 783.99, ms: 320, source: 'triangle', gain: 0.14 },
      { delayMs: 260, hz: 1046.5, ms: 320, source: 'sine', gain: 0.08 },
    ],
  },
}

/** 소리 전체 길이 (ms). 가장 늦게 끝나는 레이어를 따른다. */
export function durationMs(spec: SfxSpec): number {
  let end = 0
  for (const layer of spec.layers) {
    const repeats = Math.max(1, layer.repeat ?? 1)
    const spread = (repeats - 1) * (layer.repeatSpreadMs ?? 0)
    end = Math.max(end, layer.delayMs + spread + layer.ms)
  }
  return end
}
