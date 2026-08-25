/**
 * 오디오 — 적응형 4스템 BGM 과 SFX.
 *
 * 스템을 게인으로 섞는다. 크로스페이드도 이음매도 없고 CPU 도 거의 안 든다.
 * 갑옷 상태가 바뀌면 곡이 바뀌는 게 아니라 **층이 붙고 빠진다.**
 * → docs/07-audio.md 7.2
 */

import type { Theme } from './bgmPattern.ts'

export const STEMS = ['rhythm', 'bass', 'melody', 'chorus', 'percussion'] as const
export type Stem = (typeof STEMS)[number]

export type StemMix = Readonly<Record<Stem, number>>

const SILENT: StemMix = Object.freeze({
  rhythm: 0, bass: 0, melody: 0, chorus: 0, percussion: 0,
})

/** 갑옷 상태별 믹스. → docs/07 7.2 */
export const ARMOR_MIX = {
  relic: { rhythm: 1, bass: 1, melody: 1, chorus: 1, percussion: 0 },
  steel: { rhythm: 1, bass: 1, melody: 1, chorus: 0, percussion: 0 },
  bare: { rhythm: 1, bass: 1, melody: 0.35, chorus: 0, percussion: 0 },
  bones: SILENT,
} as const satisfies Readonly<Record<string, StemMix>>

/** 속옷 상태의 저역 통과. 소리가 멀어지며 심장 소리만 남는다. */
export const BARE_LOWPASS_HZ = 800
/** 잔여 30초의 템포 상승. */
export const HURRY_TEMPO = 1.12

export interface MusicState {
  /** 어떤 곡인가. 보스룸에 들어가면 바뀐다 → docs/07 7.2 */
  readonly theme: Theme
  readonly mix: StemMix
  readonly lowpassHz: number | null
  readonly tempo: number
  /** 더킹으로 낮아진 배율 [0,1] */
  readonly duck: number
  readonly duckRecoveryMs: number
  readonly duckElapsedMs: number
  /** 무음 남은 시간. 보스 등장 전 0.3초. */
  readonly silenceMs: number
}

export const INITIAL_MUSIC: MusicState = Object.freeze({
  theme: 'stage' as Theme,
  mix: ARMOR_MIX.steel,
  lowpassHz: null,
  tempo: 1,
  duck: 1,
  duckRecoveryMs: 0,
  duckElapsedMs: 0,
  silenceMs: 0,
})

export interface MusicInputs {
  readonly armor: keyof typeof ARMOR_MIX
  /** 남은 시간(초). 30초 이하면 서두른다. */
  readonly secondsLeft: number
}

/** 상태에 맞는 믹스를 만든다. 곡을 바꾸지 않고 층만 조절한다. */
export function mixFor(inputs: MusicInputs): MusicState['mix'] {
  const base = ARMOR_MIX[inputs.armor]
  if (inputs.secondsLeft > 30) return base
  // 잔여 30초 — 타악기 층이 붙는다
  return { ...base, percussion: 1 }
}

export function tempoFor(inputs: MusicInputs): number {
  return inputs.secondsLeft <= 30 ? HURRY_TEMPO : 1
}

export function lowpassFor(inputs: MusicInputs): number | null {
  return inputs.armor === 'bare' ? BARE_LOWPASS_HZ : null
}

export const DUCK = {
  armorBreak: { amountDb: -9, recoveryMs: 600 },
  death: { amountDb: -18, recoveryMs: 1200 },
} as const

/** 보스 등장 전 무음. 소리가 사라지면 사람은 화면을 본다. */
export const BOSS_SILENCE_MS = 300

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

export function duckMusic(state: MusicState, spec: { amountDb: number; recoveryMs: number }): MusicState {
  const target = dbToGain(spec.amountDb)
  // 이미 더 깊게 눌려 있으면 유지한다. 얕은 더킹이 깊은 것을 되돌리면 안 된다.
  if (state.duck <= target) return state
  return { ...state, duck: target, duckRecoveryMs: spec.recoveryMs, duckElapsedMs: 0 }
}

/**
 * 보스 테마로 넘어간다.
 *
 * **퍼커션이 항상 열린다.** 보스전에서 마디 첫 박의 타격은 장식이 아니라
 * 패턴을 세는 박자다 — 잔여 30초에만 열리는 스테이지 규칙과 다르다.
 */
export function toBossTheme(state: MusicState): MusicState {
  if (state.theme === 'boss') return state
  return { ...state, theme: 'boss', mix: { ...state.mix, percussion: 1 } }
}

export function silence(state: MusicState, ms: number = BOSS_SILENCE_MS): MusicState {
  return { ...state, silenceMs: ms }
}

export function stepMusic(state: MusicState, inputs: MusicInputs, dtMs: number): MusicState {
  const step = Math.max(0, dtMs)
  const silenceMs = Math.max(0, state.silenceMs - step)

  let duck = state.duck
  let duckElapsedMs = state.duckElapsedMs
  if (duck < 1 && state.duckRecoveryMs > 0) {
    duckElapsedMs += step
    const t = Math.min(1, duckElapsedMs / state.duckRecoveryMs)
    const from = dbToGain(-Math.abs(20 * Math.log10(state.duck) || 0))
    duck = from + (1 - from) * t
    if (t >= 1) duck = 1
  }

  const base = mixFor(inputs)
  // 보스전에서는 퍼커션이 늘 열려 있다. 마디 첫 박의 타격이 패턴을 세는
  // 박자라, 잔여 30초 규칙에 맡기면 정작 필요할 때 없다.
  const mix = state.theme === 'boss' ? { ...base, percussion: 1 } : base

  return {
    theme: state.theme,
    mix,
    lowpassHz: lowpassFor(inputs),
    tempo: tempoFor(inputs),
    duck,
    duckRecoveryMs: duck >= 1 ? 0 : state.duckRecoveryMs,
    duckElapsedMs,
    silenceMs,
  }
}

/** 스템별 최종 게인. 무음 중에는 전부 0 이다. */
export function gainsOf(state: MusicState): StemMix {
  if (state.silenceMs > 0) return SILENT
  return {
    rhythm: state.mix.rhythm * state.duck,
    bass: state.mix.bass * state.duck,
    melody: state.mix.melody * state.duck,
    chorus: state.mix.chorus * state.duck,
    percussion: state.mix.percussion * state.duck,
  }
}

// ── 프리로드 ────────────────────────────────────────────────────────────────

/**
 * 보스 BGM 은 보스룸 30초 전에 로드한다. 문 앞에서 멈추면 순간이 죽는다.
 *
 * **아직 아무도 부르지 않는다.** 지금 BGM 은 음원 파일이 아니라 합성이라
 * 로드할 것이 없다. 파일이 생기면 이 자리에서 걸어 준다. → docs/07 7.2
 */
export const BOSS_PRELOAD_DISTANCE_PX = 30 * 110

export function shouldPreloadBoss(playerX: number, bossGateX: number): boolean {
  return bossGateX - playerX <= BOSS_PRELOAD_DISTANCE_PX
}
