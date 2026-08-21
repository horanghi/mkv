import { describe, expect, it } from 'vitest'
import { createRng, nextFloat, nextInt, pick } from './rng.ts'

function take(seed: number, count: number): number[] {
  let state = createRng(seed)
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    const draw = nextFloat(state)
    state = draw.state
    out.push(draw.value)
  }
  return out
}

describe('시드 난수', () => {
  it('같은 시드는 같은 수열을 준다', () => {
    expect(take(1234, 20)).toEqual(take(1234, 20))
  })

  it('다른 시드는 다른 수열을 준다', () => {
    expect(take(1, 10)).not.toEqual(take(2, 10))
  })

  it('시드 0 도 고이지 않는다', () => {
    const values = take(0, 10)
    expect(new Set(values).size).toBeGreaterThan(1)
  })

  it('[0, 1) 범위를 지킨다', () => {
    for (const v of take(99, 500)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('분포가 한쪽으로 쏠리지 않는다', () => {
    const values = take(7, 2000)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    expect(mean).toBeGreaterThan(0.45)
    expect(mean).toBeLessThan(0.55)
  })

  it('상태를 바꾸지 않고 새 상태를 돌려준다', () => {
    const state = createRng(42)
    const a = nextFloat(state)
    const b = nextFloat(state)
    expect(a).toEqual(b)
    expect(a.state).not.toBe(state)
  })
})

describe('nextInt', () => {
  it('[min, max) 범위를 지킨다', () => {
    let state = createRng(5)
    for (let i = 0; i < 200; i += 1) {
      const draw = nextInt(state, 3, 7)
      state = draw.state
      expect(draw.int).toBeGreaterThanOrEqual(3)
      expect(draw.int).toBeLessThan(7)
      expect(Number.isInteger(draw.int)).toBe(true)
    }
  })

  it('빈 범위는 min 을 준다', () => {
    expect(nextInt(createRng(1), 5, 5).int).toBe(5)
    expect(nextInt(createRng(1), 5, 2).int).toBe(5)
  })
})

describe('pick', () => {
  it('배열에서 고른다', () => {
    const items = ['a', 'b', 'c'] as const
    const drawn = pick(createRng(3), items)
    expect(items).toContain(drawn.item)
  })

  it('빈 배열은 undefined 를 준다', () => {
    expect(pick(createRng(3), []).item).toBeUndefined()
  })

  it('같은 시드는 같은 것을 고른다', () => {
    const items = [1, 2, 3, 4, 5]
    expect(pick(createRng(11), items).item).toBe(pick(createRng(11), items).item)
  })
})
