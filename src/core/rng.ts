/**
 * 결정론용 시드 난수.
 *
 * `Math.random()` 은 로직 어디에서도 쓰지 않는다. 리플레이·골든 테스트·
 * 리듬 동기(S3)가 전부 "같은 입력 → 같은 결과" 위에 서 있다.
 *
 * mulberry32 — 32비트 상태, 주기 2^32. 게임 한 판에 충분하고 이식이 쉽다.
 */

/** 난수 상태는 부호 없는 32비트 정수 하나다. */
export type RngState = number

export interface RngDraw {
  readonly state: RngState
  /** [0, 1) */
  readonly value: number
}

export function createRng(seed: number): RngState {
  // 시드 0 은 상태가 고이므로 피한다.
  return (Math.trunc(seed) >>> 0) || 0x9e3779b9
}

/** 다음 난수를 뽑는다. 상태를 바꾸지 않고 새 상태를 함께 돌려준다. */
export function nextFloat(state: RngState): RngDraw {
  let a = (state + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return { state: a, value }
}

/** [min, max) 정수. 적 패턴 선택처럼 이산적인 곳에 쓴다. */
export function nextInt(state: RngState, min: number, max: number): RngDraw & { readonly int: number } {
  const draw = nextFloat(state)
  const span = Math.max(0, Math.trunc(max) - Math.trunc(min))
  return { ...draw, int: Math.trunc(min) + (span === 0 ? 0 : Math.floor(draw.value * span)) }
}

/** 배열에서 하나 고른다. 빈 배열이면 undefined. */
export function pick<T>(state: RngState, items: readonly T[]): RngDraw & { readonly item: T | undefined } {
  if (items.length === 0) return { ...nextFloat(state), item: undefined }
  const draw = nextInt(state, 0, items.length)
  return { state: draw.state, value: draw.value, item: items[draw.int] }
}
