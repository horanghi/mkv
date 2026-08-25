/**
 * 일시정지.
 *
 * docs/09 9.3 이 "복귀는 3-2-1 카운트다운 후"라고 못박는다. 바로 재개하면
 * 손을 올리기도 전에 맞는다 — 그건 어려운 게 아니라 불공정한 것이다.
 *
 * 계측에도 걸린다. 일시정지가 없으면 자리를 뜬 테스터가 그냥 죽고,
 * 그 죽음이 "이탈"로 집계되어 재시도율이 거짓으로 낮아진다.
 * → prompts/m1-gate.md
 */

export type PausePhase = 'running' | 'paused' | 'resuming'

export interface PauseState {
  readonly phase: PausePhase
  /** 재개 카운트다운 남은 시간 (ms) */
  readonly countdownMs: number
}

export const RUNNING: PauseState = Object.freeze({ phase: 'running', countdownMs: 0 })

/** 3-2-1. 한 숫자당 1초. */
export const COUNTDOWN_MS = 3000

export function pause(state: PauseState): PauseState {
  return state.phase === 'paused' ? state : { phase: 'paused', countdownMs: 0 }
}

/** 재개를 시작한다. 바로 풀리지 않고 카운트다운을 거친다. */
export function resume(state: PauseState): PauseState {
  return state.phase === 'paused' ? { phase: 'resuming', countdownMs: COUNTDOWN_MS } : state
}

/** 토글. 카운트다운 중에 다시 누르면 도로 멈춘다. */
export function toggle(state: PauseState): PauseState {
  return state.phase === 'running' ? pause(state) : resume(state)
}

export function step(state: PauseState, dtMs: number): PauseState {
  if (state.phase !== 'resuming') return state

  const remaining = state.countdownMs - Math.max(0, dtMs)
  return remaining <= 0 ? RUNNING : { phase: 'resuming', countdownMs: remaining }
}

/** 로직 틱을 돌려도 되는가. 카운트다운 중에는 아직 아니다. */
export function isPlayable(state: PauseState): boolean {
  return state.phase === 'running'
}

/** 화면을 덮어야 하는가. 카운트다운 중에는 게임이 보여야 한다. */
export function isMenuOpen(state: PauseState): boolean {
  return state.phase === 'paused'
}

/** 화면에 띄울 숫자. 3 → 2 → 1. 카운트다운이 아니면 null. */
export function countdownNumber(state: PauseState): number | null {
  if (state.phase !== 'resuming') return null
  return Math.max(1, Math.ceil(state.countdownMs / 1000))
}
