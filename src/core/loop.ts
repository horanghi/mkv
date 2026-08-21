import { MAX_CATCHUP_TICKS, TICK_MS } from './config.ts'

/**
 * 고정 타임스텝 루프의 순수 부분.
 *
 * rAF 콜백이 준 프레임 시간을 받아 **이번 프레임에 몇 틱을 돌릴지**만 계산한다.
 * DOM 도, 렌더러도 모른다 — 그래서 테스트할 수 있다.
 *
 * → docs/10-tech-spec.md 10.3
 */

export interface LoopState {
  /** 아직 틱으로 환산되지 않고 남은 시간. */
  readonly accumulatorMs: number
  /** 지금까지 실행한 로직 틱 수. **정수 카운터** — 시간을 float 로 세지 않는다. */
  readonly tick: number
  /** 남은 히트스톱. 0보다 크면 로직 틱이 멈춘다. */
  readonly hitstopMs: number
}

export interface LoopAdvance {
  readonly state: LoopState
  /** 이번 프레임에 실행할 로직 틱 수. 0 일 수 있다. */
  readonly ticks: number
  /** 캐치업 상한에 걸려 버린 틱 수. 0 이 아니면 프레임을 놓치고 있다는 뜻이다. */
  readonly droppedTicks: number
  /** 렌더 보간 계수 [0, 1). */
  readonly alpha: number
  /** 이번 프레임이 히트스톱으로 소비되었는가. */
  readonly hitstopped: boolean
}

export const INITIAL_LOOP: LoopState = {
  accumulatorMs: 0,
  tick: 0,
  hitstopMs: 0,
}

/**
 * 프레임 시간을 로직 틱으로 환산한다.
 *
 * 히트스톱 중에는 누산기에 시간을 넣지 않는다. 넣어두면 히트스톱이 끝나는 순간
 * 밀린 틱이 한꺼번에 터져서 연출이 통째로 날아간다.
 */
export function advance(state: LoopState, frameMs: number): LoopAdvance {
  const elapsed = Number.isFinite(frameMs) && frameMs > 0 ? frameMs : 0

  let hitstopMs = state.hitstopMs
  let usable = elapsed
  let hitstopped = false

  if (hitstopMs > 0) {
    const consumed = Math.min(hitstopMs, elapsed)
    hitstopMs -= consumed
    usable = elapsed - consumed
    hitstopped = true
  }

  const accumulated = state.accumulatorMs + usable
  const wanted = Math.floor(accumulated / TICK_MS)
  const ticks = Math.min(wanted, MAX_CATCHUP_TICKS)
  const droppedTicks = wanted - ticks

  // 버린 틱의 시간도 함께 버린다. 남겨두면 영원히 따라잡지 못하는 나선에 빠진다.
  const accumulatorMs = accumulated - wanted * TICK_MS

  return {
    state: {
      accumulatorMs,
      tick: state.tick + ticks,
      hitstopMs,
    },
    ticks,
    droppedTicks,
    alpha: accumulatorMs / TICK_MS,
    hitstopped,
  }
}

/** 히트스톱을 건다. 이미 걸려 있으면 **긴 쪽**이 이긴다 — 연출이 잘리지 않게. */
export function requestHitstop(state: LoopState, durationMs: number): LoopState {
  const requested = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0
  return { ...state, hitstopMs: Math.max(state.hitstopMs, requested) }
}

/** 히트스톱을 즉시 해제한다. 사망·씬 전환처럼 연출을 끊어야 할 때. */
export function clearHitstop(state: LoopState): LoopState {
  return { ...state, hitstopMs: 0 }
}
