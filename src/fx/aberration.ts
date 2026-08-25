/**
 * 크로매틱 애버레이션.
 *
 * **상시 적용은 금지다.** 계속 걸어두면 화면이 항상 어긋나 보여
 * "화려함"이 아니라 "번짐"이 된다. 이벤트 순간에만 짧게 지나간다.
 * → docs/06-visual-direction.md 6.4
 */

export const ABERRATION_EVENTS = ['armorBreak', 'bossEntrance', 'sigil', 'phaseShift'] as const
export type AberrationEvent = (typeof ABERRATION_EVENTS)[number]

export interface AberrationSpec {
  /** 최대 강도. 1.0 이 약 4px 분리다. */
  readonly peak: number
  readonly durationMs: number
}

/** docs/06 6.4 의 표를 그대로 옮긴 것이다. */
export const ABERRATION: Readonly<Record<AberrationEvent, AberrationSpec>> = {
  armorBreak: { peak: 0.8, durationMs: 140 },
  bossEntrance: { peak: 1.2, durationMs: 600 },
  sigil: { peak: 0.5, durationMs: 200 },
  phaseShift: { peak: 1.5, durationMs: 800 },
}

export interface AberrationState {
  readonly peak: number
  readonly durationMs: number
  readonly elapsedMs: number
}

export const NO_ABERRATION: AberrationState = Object.freeze({
  peak: 0,
  durationMs: 0,
  elapsedMs: 0,
})

/**
 * 이벤트를 건다. 이미 걸려 있으면 **강한 쪽이 이긴다.**
 *
 * 겹쳐 더하면 보스 등장 중 갑옷이 깨졌을 때 화면이 찢어진다.
 */
export function trigger(state: AberrationState, event: AberrationEvent): AberrationState {
  const spec = ABERRATION[event]
  // 현재 강도가 아니라 **남은 잠재 강도**로 비교한다. 방금 시작한 이벤트는
  // 강도가 아직 0 이라, 현재값으로 비교하면 약한 이벤트가 밀어내 버린다.
  if (spec.peak < remainingPeak(state)) return state
  return { peak: spec.peak, durationMs: spec.durationMs, elapsedMs: 0 }
}

/** 앞으로 낼 수 있는 최대 강도. 끝나갈수록 작아진다. */
function remainingPeak(state: AberrationState): number {
  if (state.durationMs <= 0) return 0
  return state.peak * Math.max(0, 1 - state.elapsedMs / state.durationMs)
}

export function step(state: AberrationState, dtMs: number): AberrationState {
  if (state.durationMs <= 0) return NO_ABERRATION
  const elapsedMs = state.elapsedMs + Math.max(0, dtMs)
  if (elapsedMs >= state.durationMs) return NO_ABERRATION
  return { ...state, elapsedMs }
}

/**
 * 지금 강도. 0 → peak → 0 로 오르내린다.
 *
 * 즉시 최대로 켜고 서서히 끄면 "터졌다"가 아니라 "켜졌다 꺼졌다"로 읽힌다.
 * 짧게 솟았다 사라지는 산 모양이라야 충격으로 읽힌다.
 */
export function strengthOf(state: AberrationState): number {
  if (state.durationMs <= 0 || state.elapsedMs >= state.durationMs) return 0
  const t = state.elapsedMs / state.durationMs
  // 앞부분에서 빠르게 솟고 뒤에서 길게 빠진다
  const shape = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75
  return state.peak * Math.max(0, shape)
}

/** 셰이더에 넘길 픽셀 분리량. 1.0 강도가 약 4px 다. */
export function pixelOffset(state: AberrationState): number {
  return strengthOf(state) * 4
}

export function isActive(state: AberrationState): boolean {
  return strengthOf(state) > 0
}
