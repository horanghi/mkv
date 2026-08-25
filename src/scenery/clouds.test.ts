import { describe, expect, it } from 'vitest'
import { createRng } from '../core/rng.ts'
import { cloudBands, type CloudSpec } from './clouds.ts'

const SPEC: CloudSpec = {
  width: 600, count: 6,
  minY: 20, maxY: 120,
  minWidth: 60, maxWidth: 160,
  minHeight: 2, maxHeight: 7,
}

describe('하늘 구름', () => {
  it('요청한 개수만큼 만든다', () => {
    expect(cloudBands(createRng(1), SPEC)).toHaveLength(6)
  })

  it('같은 시드면 같은 하늘이다', () => {
    expect(cloudBands(createRng(9), SPEC)).toEqual(cloudBands(createRng(9), SPEC))
  })

  it('구간과 높이 범위 안에 있다', () => {
    for (const cloud of cloudBands(createRng(3), SPEC)) {
      expect(cloud.x).toBeGreaterThanOrEqual(0)
      expect(cloud.x).toBeLessThan(SPEC.width)
      expect(cloud.y).toBeGreaterThanOrEqual(SPEC.minY)
      expect(cloud.y).toBeLessThanOrEqual(SPEC.maxY)
      expect(cloud.width).toBeGreaterThanOrEqual(SPEC.minWidth)
      expect(cloud.width).toBeLessThanOrEqual(SPEC.maxWidth)
      expect(cloud.height).toBeGreaterThanOrEqual(SPEC.minHeight)
      expect(cloud.height).toBeLessThanOrEqual(SPEC.maxHeight)
    }
  })

  it('아주 옅다 — 하늘이 배경이지 무늬가 되면 안 된다', () => {
    for (const cloud of cloudBands(createRng(5), SPEC)) {
      expect(cloud.alpha).toBeGreaterThan(0)
      expect(cloud.alpha).toBeLessThan(0.2)
    }
  })

  it('두꺼운 띠가 더 진하다 — 얇은 것이 진하면 선처럼 보인다', () => {
    const clouds = [...cloudBands(createRng(7), { ...SPEC, count: 30 })]
    const thin = clouds.reduce((a, b) => (a.height <= b.height ? a : b))
    const thick = clouds.reduce((a, b) => (a.height >= b.height ? a : b))

    expect(thick.alpha).toBeGreaterThan(thin.alpha)
  })

  it('한 자리에 몰리지 않는다', () => {
    const xs = cloudBands(createRng(11), { ...SPEC, count: 8 }).map((c) => c.x)
    expect(new Set(xs).size).toBeGreaterThan(4)
  })

  it('개수가 0 이거나 폭이 0 이면 비어 있다', () => {
    expect(cloudBands(createRng(1), { ...SPEC, count: 0 })).toEqual([])
    expect(cloudBands(createRng(1), { ...SPEC, width: 0 })).toEqual([])
  })

  it('높이 범위가 한 점이어도 터지지 않는다', () => {
    const flat = cloudBands(createRng(1), { ...SPEC, minHeight: 3, maxHeight: 3 })
    expect(flat).toHaveLength(6)
    for (const cloud of flat) expect(Number.isFinite(cloud.alpha)).toBe(true)
  })
})
