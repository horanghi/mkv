import { describe, expect, it } from 'vitest'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './config.ts'
import { computeScale, computeViewport, screenToLogical } from './viewport.ts'

describe('computeScale', () => {
  it('논리 해상도와 정확히 같으면 1배', () => {
    expect(computeScale(LOGICAL_WIDTH, LOGICAL_HEIGHT)).toBe(1)
  })

  it('정확한 배수는 그대로 쓴다', () => {
    expect(computeScale(LOGICAL_WIDTH * 3, LOGICAL_HEIGHT * 3)).toBe(3)
  })

  it('비정수 배율은 내림한다 — 픽셀 크기 불균등이 여백보다 나쁘다', () => {
    // 1920x1080 → 가로 4.0, 세로 4.0
    expect(computeScale(1920, 1080)).toBe(4)
    // 1600x900 → 가로 3.33, 세로 3.33
    expect(computeScale(1600, 900)).toBe(3)
    // 1440x900 → 가로 3.0, 세로 3.33 → 좁은 쪽을 따른다
    expect(computeScale(1440, 900)).toBe(3)
  })

  it('짧은 축이 배율을 결정한다', () => {
    // 가로는 넉넉하지만 세로가 2배까지만 된다
    expect(computeScale(LOGICAL_WIDTH * 10, LOGICAL_HEIGHT * 2)).toBe(2)
  })

  it('논리 해상도보다 작아도 1배 아래로 내려가지 않는다', () => {
    expect(computeScale(320, 200)).toBe(1)
    expect(computeScale(0, 0)).toBe(1)
  })

  it('상한을 넘지 않는다', () => {
    expect(computeScale(100_000, 100_000)).toBe(8)
    expect(computeScale(100_000, 100_000, { maxScale: 3 })).toBe(3)
  })

  it('NaN 입력은 최소 배율로 떨어진다', () => {
    expect(computeScale(Number.NaN, 1080)).toBe(1)
  })
})

describe('computeViewport', () => {
  it('레터박스 여백을 정수로 준다', () => {
    const vp = computeViewport(1920, 1080)
    expect(vp.scale).toBe(4)
    expect(vp.width).toBe(1920)
    expect(vp.height).toBe(1080)
    expect(vp.offsetX).toBe(0)
    expect(vp.offsetY).toBe(0)
  })

  it('남는 공간을 상하좌우로 나눈다', () => {
    // 2000x1100 에서 4배(1920x1080) → 가로 80, 세로 20 남음
    const vp = computeViewport(2000, 1100)
    expect(vp.scale).toBe(4)
    expect(vp.offsetX).toBe(40)
    expect(vp.offsetY).toBe(10)
  })

  it('홀수 여백에서도 오프셋이 정수다', () => {
    const vp = computeViewport(1921, 1081)
    expect(Number.isInteger(vp.offsetX)).toBe(true)
    expect(Number.isInteger(vp.offsetY)).toBe(true)
  })

  it('창이 논리 해상도보다 작으면 오프셋은 0 이다 — 음수 여백을 만들지 않는다', () => {
    const vp = computeViewport(320, 200)
    expect(vp.offsetX).toBe(0)
    expect(vp.offsetY).toBe(0)
  })
})

describe('screenToLogical', () => {
  it('여백과 배율을 되돌린다', () => {
    const vp = computeViewport(2000, 1100)
    expect(screenToLogical(vp.offsetX, vp.offsetY, vp)).toEqual({ x: 0, y: 0 })

    const center = screenToLogical(vp.offsetX + vp.width / 2, vp.offsetY + vp.height / 2, vp)
    expect(center.x).toBeCloseTo(LOGICAL_WIDTH / 2)
    expect(center.y).toBeCloseTo(LOGICAL_HEIGHT / 2)
  })
})
