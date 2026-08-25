import { TICK_MS } from './config.ts'

/**
 * 시간 제어 — 슬로우모션과 프레임 스텝.
 *
 * docs/10 10.10 이 M1 까지 만들 도구로 정한 것이다.
 * **연출을 프레임 단위로 검수하려면 시간을 멈출 수 있어야 한다.**
 * 히트스톱 250ms, 파편 40ms, 화면 반전 60ms 같은 값은 실시간으로는 눈에
 * 안 들어온다.
 *
 * 로직에 손대지 않는다 — 루프에 넣는 `frameMs` 만 바꾼다. 그래서 결정론이
 * 유지되고, 프레임 스텝으로 본 것이 실제로 일어나는 것과 같다.
 */

/** 슬로우모션 배율. 1 이 실시간이다. docs/10 10.10 "0.1x~1.0x" */
export const SLOW_SCALES = [1, 0.5, 0.25, 0.1] as const

export interface TimeControl {
  /** 시간 배율 */
  readonly scale: number
  /** 프레임 스텝 모드. 켜면 요청할 때만 한 틱 나아간다 */
  readonly stepping: boolean
  /** 밀린 스텝 요청 수 */
  readonly pending: number
}

export const REALTIME: TimeControl = Object.freeze({ scale: 1, stepping: false, pending: 0 })

/** 다음 배율로 순환한다. */
export function cycleScale(control: TimeControl): TimeControl {
  const index = SLOW_SCALES.indexOf(control.scale as (typeof SLOW_SCALES)[number])
  const next = SLOW_SCALES[(index + 1) % SLOW_SCALES.length] ?? 1
  return { ...control, scale: next }
}

/**
 * 프레임 스텝을 켜고 끈다.
 *
 * 끌 때 밀린 요청을 버린다 — 안 그러면 재개하는 순간 밀린 틱이 쏟아진다.
 */
export function toggleStepping(control: TimeControl): TimeControl {
  return { ...control, stepping: !control.stepping, pending: 0 }
}

/** 한 틱 나아가 달라고 요청한다. 스텝 모드가 아니면 무시한다. */
export function requestStep(control: TimeControl): TimeControl {
  return control.stepping ? { ...control, pending: control.pending + 1 } : control
}

export interface TimeSlice {
  readonly control: TimeControl
  /** 루프에 넣을 시간 (ms) */
  readonly frameMs: number
}

/**
 * 이번 프레임에 흘려보낼 시간.
 *
 * 스텝 모드에서는 요청이 있을 때만 **정확히 한 틱**을 준다.
 * 실제 프레임 간격을 주면 한 번 눌렀는데 여러 틱이 지나간다.
 */
export function consume(control: TimeControl, frameMs: number): TimeSlice {
  const elapsed = Number.isFinite(frameMs) && frameMs > 0 ? frameMs : 0

  if (control.stepping) {
    if (control.pending <= 0) return { control, frameMs: 0 }
    return { control: { ...control, pending: control.pending - 1 }, frameMs: TICK_MS }
  }
  return { control, frameMs: elapsed * control.scale }
}

/** 화면에 띄울 표시. 실시간이면 null — 평소에는 아무것도 안 보인다. */
export function labelOf(control: TimeControl): string | null {
  if (control.stepping) return `FRAME STEP  (F8 로 한 칸)`
  return control.scale === 1 ? null : `SLOW ${control.scale}x`
}
