/**
 * 카메라 셰이크.
 *
 * 진폭이 시간에 따라 ease-out 으로 감쇠한다. 선형으로 줄이면 끝이 뚝 끊겨
 * "흔들다 말았다"로 읽힌다. → docs/06-visual-direction.md 6.5
 */

export interface Shake {
  readonly amplitude: number
  readonly durationMs: number
  readonly frequencyHz: number
  readonly elapsedMs: number
}

export const NO_SHAKE: Shake = Object.freeze({
  amplitude: 0,
  durationMs: 0,
  frequencyHz: 0,
  elapsedMs: 0,
})

export function startShake(amplitude: number, durationMs: number, frequencyHz: number): Shake {
  return { amplitude, durationMs, frequencyHz, elapsedMs: 0 }
}

export function stepShake(shake: Shake, dtMs: number): Shake {
  if (shake.durationMs <= 0) return NO_SHAKE
  const elapsedMs = shake.elapsedMs + Math.max(0, dtMs)
  if (elapsedMs >= shake.durationMs) return NO_SHAKE
  return { ...shake, elapsedMs }
}

export function isShaking(shake: Shake): boolean {
  return shake.durationMs > 0 && shake.elapsedMs < shake.durationMs
}

/**
 * 이번 프레임의 흔들림 오프셋.
 *
 * x 와 y 의 주파수를 어긋나게 둔다. 같은 주파수면 대각선으로만 왕복해
 * 흔들림이 아니라 미끄러짐으로 보인다.
 */
export function shakeOffset(shake: Shake): { readonly x: number; readonly y: number } {
  if (!isShaking(shake)) return { x: 0, y: 0 }

  const t = shake.elapsedMs / 1000
  const decay = easeOut(1 - shake.elapsedMs / shake.durationMs)
  const amp = shake.amplitude * decay
  const w = shake.frequencyHz * Math.PI * 2

  return {
    x: Math.round(Math.sin(w * t) * amp),
    y: Math.round(Math.cos(w * 0.73 * t) * amp * 0.6),
  }
}

/** 셋을 겹쳐도 가장 강한 것 하나만 쓴다. 더하면 화면이 튀어 나간다. */
export function strongest(a: Shake, b: Shake): Shake {
  const strengthOf = (s: Shake) => (isShaking(s) ? s.amplitude * (1 - s.elapsedMs / s.durationMs) : 0)
  return strengthOf(b) > strengthOf(a) ? b : a
}

function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped
}
