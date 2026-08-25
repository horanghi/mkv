import { describe, expect, it } from 'vitest'
import { createRng } from '../core/rng.ts'
import { scatter, type PropKind, type ScatterSpec } from './props.ts'

const KINDS: readonly PropKind[] = [
  { name: 'stone', minWidth: 5, maxWidth: 9, minHeight: 8, maxHeight: 16, weight: 5 },
  { name: 'pillar', minWidth: 6, maxWidth: 8, minHeight: 26, maxHeight: 40, weight: 1 },
]

const SPEC: ScatterSpec = { width: 600, spacing: 50, jitter: 0.4, kinds: KINDS }

describe('소품 배치', () => {
  it('같은 시드면 같은 배치다', () => {
    expect(scatter(createRng(9), SPEC)).toEqual(scatter(createRng(9), SPEC))
  })

  it('구간 폭 안에 들어간다 — 이음매에서 잘린 묘비가 보이면 안 된다', () => {
    for (const prop of scatter(createRng(2), SPEC)) {
      expect(prop.x).toBeGreaterThanOrEqual(0)
      expect(prop.x + prop.width).toBeLessThanOrEqual(SPEC.width)
    }
  })

  it('간격만큼 성기게 놓인다', () => {
    const props = scatter(createRng(4), SPEC)
    expect(props.length).toBeGreaterThan(5)
    expect(props.length).toBeLessThan(20)
  })

  it('크기가 종류의 범위 안이다', () => {
    for (const prop of scatter(createRng(6), SPEC)) {
      const kind = KINDS.find((k) => k.name === prop.kind)!
      expect(prop.width).toBeGreaterThanOrEqual(kind.minWidth)
      expect(prop.width).toBeLessThanOrEqual(kind.maxWidth)
      expect(prop.height).toBeGreaterThanOrEqual(kind.minHeight)
      expect(prop.height).toBeLessThanOrEqual(kind.maxHeight)
    }
  })

  it('가중치가 큰 종류가 더 자주 나온다', () => {
    const props = scatter(createRng(13), { ...SPEC, width: 6000 })
    const stones = props.filter((p) => p.kind === 'stone').length
    const pillars = props.filter((p) => p.kind === 'pillar').length

    expect(stones).toBeGreaterThan(pillars)
  })

  it('jitter 가 0 이면 자로 잰 듯 늘어선다', () => {
    const props = scatter(createRng(1), { ...SPEC, jitter: 0 })
    const gaps = props.slice(1).map((p, i) => p.x - props[i]!.x)

    expect(new Set(gaps).size).toBe(1)
  })

  it('좌우 반전이 섞인다 — 같은 모양이 반복되는 티를 줄인다', () => {
    const props = scatter(createRng(8), { ...SPEC, width: 4000 })
    const flipped = props.filter((p) => p.flipped).length

    expect(flipped).toBeGreaterThan(0)
    expect(flipped).toBeLessThan(props.length)
  })

  it('뽑힌 종류가 항상 목록 안에 있다', () => {
    const props = scatter(createRng(21), { ...SPEC, width: 20000 })
    expect(props.every((p) => KINDS.some((k) => k.name === p.kind))).toBe(true)
  })

  it('종류가 없거나 간격이 0 이면 아무것도 놓지 않는다 — 무한 루프에 빠지지 않는다', () => {
    expect(scatter(createRng(1), { ...SPEC, kinds: [] })).toEqual([])
    expect(scatter(createRng(1), { ...SPEC, spacing: 0 })).toEqual([])
    expect(scatter(createRng(1), { ...SPEC, kinds: [{ ...KINDS[0]!, weight: 0 }] })).toEqual([])
  })
})
