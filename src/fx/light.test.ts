import { describe, expect, it } from 'vitest'
import {
  RELIC_LIGHT,
  TORCH_LIGHT,
  contributionAt,
  intensityAt,
  limitLights,
  packColors,
  packLights,
  type Light,
} from './light.ts'

const steady: Light = { x: 100, y: 100, radius: 50, color: 0xffffff, intensity: 1 }
const torch: Light = { ...steady, ...TORCH_LIGHT, x: 100, y: 100 }

describe('감쇠', () => {
  it('중심이 가장 밝다', () => {
    expect(contributionAt(steady, 100, 100, 0)).toBeCloseTo(1)
  })

  it('반경 밖은 0 이다', () => {
    expect(contributionAt(steady, 200, 100, 0)).toBe(0)
    expect(contributionAt(steady, 150, 100, 0)).toBe(0)
  })

  it('멀어질수록 어두워진다', () => {
    const samples = [0, 10, 20, 30, 40].map((d) => contributionAt(steady, 100 + d, 100, 0))
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeLessThan(samples[i - 1]!)
    }
  })

  it('반경 안이 고르게 밝다 — 물리 정확도보다 가독성이다', () => {
    // 절반 거리에서 아직 4분의 1 이상 밝다. 제곱 감쇠면 훨씬 어둡다.
    expect(contributionAt(steady, 125, 100, 0)).toBeGreaterThan(0.2)
  })
})

describe('깜빡임', () => {
  it('깜빡임이 없으면 강도가 일정하다', () => {
    expect(intensityAt(steady, 0)).toBe(1)
    expect(intensityAt(steady, 5000)).toBe(1)
  })

  it('횃불은 흔들린다', () => {
    const samples = Array.from({ length: 40 }, (_, i) => intensityAt(torch, i * 20))
    expect(new Set(samples.map((v) => v.toFixed(3))).size).toBeGreaterThan(10)
  })

  it('음수로 내려가지 않는다', () => {
    const wild: Light = { ...steady, flicker: { amplitude: 5, hz: 10, phase: 0 } }
    for (let i = 0; i < 200; i += 1) expect(intensityAt(wild, i * 7)).toBeGreaterThanOrEqual(0)
  })

  it('위상이 다르면 같이 깜빡이지 않는다', () => {
    const a: Light = { ...torch, flicker: { amplitude: 0.3, hz: 9, phase: 0 } }
    const b: Light = { ...torch, flicker: { amplitude: 0.3, hz: 9, phase: 2.1 } }
    const differ = Array.from({ length: 20 }, (_, i) =>
      Math.abs(intensityAt(a, i * 30) - intensityAt(b, i * 30)))
    expect(Math.max(...differ)).toBeGreaterThan(0.05)
  })

  it('규칙적인 맥동으로 보이지 않는다 — 사인 하나면 기계적이다', () => {
    const period = 1000 / (TORCH_LIGHT.flicker.hz)
    const a = intensityAt(torch, 0)
    const b = intensityAt(torch, period)
    expect(Math.abs(a - b)).toBeGreaterThan(0.001)
  })
})

describe('성유물 광원 — 갑옷이 곧 손전등이다', () => {
  it('세 종류 모두 빛난다', () => {
    for (const spec of Object.values(RELIC_LIGHT)) {
      expect(spec.radius).toBeGreaterThan(0)
      expect(spec.intensity).toBeGreaterThan(0)
    }
  })

  it('황금이 가장 넓게 비춘다', () => {
    expect(RELIC_LIGHT.gold.radius).toBeGreaterThanOrEqual(RELIC_LIGHT.silver.radius)
    expect(RELIC_LIGHT.gold.radius).toBeGreaterThanOrEqual(RELIC_LIGHT.crystal.radius)
  })
})

describe('광원 수 제한', () => {
  const many: Light[] = Array.from({ length: 40 }, (_, i) => ({
    x: i * 20, y: 0, radius: 30, color: 0xffffff, intensity: 1,
  }))

  it('상한을 넘지 않는다', () => {
    expect(limitLights(many, 16, { x: 0, y: 0 })).toHaveLength(16)
  })

  it('가까운 것부터 남긴다', () => {
    const kept = limitLights(many, 5, { x: 0, y: 0 })
    expect(kept.map((l) => l.x)).toEqual([0, 20, 40, 60, 80])
  })

  it('상한보다 적으면 그대로 둔다', () => {
    const few = many.slice(0, 3)
    expect(limitLights(few, 16, { x: 0, y: 0 })).toBe(few)
  })

  it('상한이 0 이면 전부 끈다 — 낮음 품질', () => {
    expect(limitLights(many, 0, { x: 0, y: 0 })).toEqual([])
  })
})

describe('셰이더 입력', () => {
  it('위치·반경·강도를 평평하게 담는다', () => {
    const packed = packLights([steady], 0)
    expect(Array.from(packed)).toEqual([100, 100, 50, 1])
  })

  it('색을 0~1 로 담는다', () => {
    const red: Light = { ...steady, color: 0xff0000 }
    expect(Array.from(packColors([red]))).toEqual([1, 0, 0])
  })

  it('깜빡임이 강도에 반영된다', () => {
    const a = packLights([torch], 0)[3]
    const b = packLights([torch], 55)[3]
    expect(a).not.toBe(b)
  })

  it('빈 목록은 빈 배열이다', () => {
    expect(packLights([], 0)).toHaveLength(0)
    expect(packColors([])).toHaveLength(0)
  })
})
