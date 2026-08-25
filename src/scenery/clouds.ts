import { nextFloat, type RngState } from '../core/rng.ts'

/**
 * 하늘의 구름 띠.
 *
 * docs/06 6.2 의 1층은 "그라디언트 + 셰이더 노이즈(구름/오로라)" 다.
 * 셰이더 패스를 하나 더 쓰는 대신 가로로 긴 반투명 띠 몇 개로 만든다 —
 * 480×270 에서 이 정도면 구름으로 읽히고, 패스를 아낀 만큼 프레임이 남는다.
 *
 * 순수 함수다. 같은 시드면 같은 하늘이다.
 */

export interface CloudSpec {
  /** 반복 구간 폭 */
  readonly width: number
  readonly count: number
  readonly minY: number
  readonly maxY: number
  readonly minWidth: number
  readonly maxWidth: number
  readonly minHeight: number
  readonly maxHeight: number
}

export interface Cloud {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** 0~1. 얇은 것일수록 옅다 — 멀리 있는 것처럼 보인다 */
  readonly alpha: number
}

export function cloudBands(seed: RngState, spec: CloudSpec): readonly Cloud[] {
  if (spec.count <= 0 || spec.width <= 0) return []

  const out: Cloud[] = []
  let state = seed

  for (let i = 0; i < spec.count; i += 1) {
    const draws: number[] = []
    for (let d = 0; d < 4; d += 1) {
      const draw = nextFloat(state)
      state = draw.state
      draws.push(draw.value)
    }
    const [dx = 0, dy = 0, dw = 0, dh = 0] = draws

    const width = Math.round(spec.minWidth + dw * (spec.maxWidth - spec.minWidth))
    const height = Math.round(spec.minHeight + dh * (spec.maxHeight - spec.minHeight))
    // 균등하게 흩되 소수부로 어긋나게 한다. 같은 간격이면 줄무늬로 보인다.
    const x = Math.round(((i / spec.count) * spec.width + dx * (spec.width / spec.count)) % spec.width)
    const y = Math.round(spec.minY + dy * (spec.maxY - spec.minY))

    // 두꺼울수록 진하다. 얇은 띠가 진하면 선처럼 보인다.
    const thickness = spec.maxHeight === spec.minHeight
      ? 1
      : (height - spec.minHeight) / (spec.maxHeight - spec.minHeight)
    out.push({ x, y, width, height, alpha: 0.05 + thickness * 0.09 })
  }

  return out
}
