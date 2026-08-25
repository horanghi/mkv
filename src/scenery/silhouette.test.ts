import { describe, expect, it } from 'vitest'
import { createRng } from '../core/rng.ts'
import { columns, ridgeline, type RidgeSpec } from './silhouette.ts'

const SPEC: RidgeSpec = { width: 200, steps: 5, minHeight: 20, maxHeight: 80, jag: 0.4 }

describe('능선', () => {
  it('요청한 폭만큼 나온다', () => {
    expect(ridgeline(createRng(1), SPEC)).toHaveLength(200)
  })

  it('같은 시드면 같은 능선이다 — 새로고침해도 배경이 바뀌면 안 된다', () => {
    expect(ridgeline(createRng(42), SPEC)).toEqual(ridgeline(createRng(42), SPEC))
  })

  it('시드가 다르면 다른 능선이다', () => {
    expect(ridgeline(createRng(42), SPEC)).not.toEqual(ridgeline(createRng(43), SPEC))
  })

  it('높이가 범위 안에 있다', () => {
    for (const height of ridgeline(createRng(7), SPEC)) {
      expect(height).toBeGreaterThanOrEqual(SPEC.minHeight)
      expect(height).toBeLessThanOrEqual(SPEC.maxHeight)
    }
  })

  it('양 끝이 맞는다 — 이어 붙였을 때 이음매가 보이면 안 된다', () => {
    const heights = ridgeline(createRng(11), SPEC)
    const first = heights[0]!
    const last = heights[heights.length - 1]!

    expect(Math.abs(last - first)).toBeLessThan(1)
  })

  it('jag 이 0 이면 매끈하다 — 이웃한 두 점이 크게 튀지 않는다', () => {
    const smooth = ridgeline(createRng(3), { ...SPEC, jag: 0 })
    let worst = 0
    for (let i = 1; i < smooth.length; i += 1) {
      worst = Math.max(worst, Math.abs(smooth[i]! - smooth[i - 1]!))
    }
    expect(worst).toBeLessThan(2)
  })

  it('jag 이 크면 거칠다', () => {
    const rough = ridgeline(createRng(3), { ...SPEC, jag: 1 })
    let worst = 0
    for (let i = 1; i < rough.length; i += 1) {
      worst = Math.max(worst, Math.abs(rough[i]! - rough[i - 1]!))
    }
    expect(worst).toBeGreaterThan(2)
  })

  it('말이 안 되는 입력에도 배열을 돌려준다', () => {
    expect(ridgeline(createRng(1), { ...SPEC, width: 0, steps: 0 })).toHaveLength(2)
  })
})

describe('기둥으로 묶기', () => {
  it('같은 높이가 이어지면 하나로 묶는다', () => {
    expect(columns([10, 10, 10, 20, 20], 2)).toEqual([
      { x: 0, width: 3, height: 10 },
      { x: 3, width: 2, height: 20 },
    ])
  })

  it('폭의 합이 원래 길이와 같다 — 빈 틈이 생기면 배경이 찢어진다', () => {
    const heights = ridgeline(createRng(5), SPEC)
    const total = columns(heights).reduce((sum, c) => sum + c.width, 0)

    expect(total).toBe(heights.length)
  })

  it('계단 간격으로 높이를 반올림한다 — 픽셀 배경에 곡선은 없다', () => {
    expect(columns([10.4, 11.6], 4).map((c) => c.height)).toEqual([12])
  })

  it('빈 능선은 빈 목록이다', () => {
    expect(columns([])).toEqual([])
  })
})
