import { describe, expect, it } from 'vitest'
import {
  DOWNGRADE_AFTER_MS,
  DOWNGRADE_FPS,
  QUALITY_TIERS,
  SLOW_DOWNGRADE_AFTER_MS,
  SLOW_DOWNGRADE_FPS,
  UPGRADE_AFTER_MS,
  UPGRADE_FPS,
  clearManual,
  createQuality,
  featuresFor,
  observeFps,
  setManual,
  type QualityState,
} from './quality.ts'

function hold(state: QualityState, fps: number, ms: number): QualityState {
  let current = state
  const step = 100
  for (let t = 0; t < ms; t += step) current = observeFps(current, fps, step).state
  return current
}

describe('티어별 기능 — docs/06 6.4', () => {
  it('낮음은 동적 광원·블룸·왜곡·그레인을 끈다', () => {
    const low = featuresFor('low')
    expect(low.dynamicLights).toBe(false)
    expect(low.bloom).toBe(false)
    expect(low.distortion).toBe(0)
    expect(low.grain).toBe(false)
  })

  it('보통은 왜곡을 줄이고 파티클 400개다', () => {
    const medium = featuresFor('medium')
    expect(medium.distortion).toBeLessThan(1)
    expect(medium.maxParticles).toBe(400)
    expect(medium.maxLights).toBe(16)
  })

  it('높음은 전부 켠다', () => {
    const high = featuresFor('high')
    expect(high.bloom).toBe(true)
    expect(high.distortion).toBe(1)
    expect(high.maxLights).toBe(32)
  })

  it('티어가 올라갈수록 무거워진다', () => {
    const values = QUALITY_TIERS.map(featuresFor)
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!.maxParticles).toBeGreaterThan(values[i - 1]!.maxParticles)
      expect(values[i]!.maxLights).toBeGreaterThanOrEqual(values[i - 1]!.maxLights)
    }
  })
})

describe('자동 강등', () => {
  it('30fps 미만이 3초 이어지면 낮춘다', () => {
    const start = createQuality('high')
    const before = hold(start, 20, DOWNGRADE_AFTER_MS - 200)
    expect(before.tier).toBe('high')

    const after = observeFps(before, 20, 300)
    expect(after.downgraded).toBe(true)
    expect(after.state.tier).toBe('medium')
  })

  it('안내는 한 번만 띄운다', () => {
    let state = hold(createQuality('high'), 20, DOWNGRADE_AFTER_MS + 200)
    expect(state.notified).toBe(true)

    const second = hold(state, 20, DOWNGRADE_AFTER_MS + 200)
    expect(second.tier).toBe('low')
    // 두 번째 강등에서는 안내하지 않는다
    let notifications = 0
    let s = createQuality('high')
    for (let t = 0; t < 20000; t += 100) {
      const change = observeFps(s, 20, 100)
      s = change.state
      if (change.notify) notifications += 1
    }
    expect(notifications).toBe(1)
  })

  it('프레임이 회복되면 누적이 초기화된다', () => {
    let state = hold(createQuality('high'), 20, 2000)
    state = observeFps(state, 60, 100).state
    expect(state.belowMs).toBe(0)
    // 다시 떨어져도 처음부터 3초를 세야 한다
    expect(hold(state, 20, 2000).tier).toBe('high')
  })

  it('가장 낮은 티어에서는 더 내려가지 않는다', () => {
    const state = hold(createQuality('low'), 10, 20000)
    expect(state.tier).toBe('low')
  })

  it('경계값에서는 빠른 규칙이 걸리지 않는다 — 미만이지 이하가 아니다', () => {
    const edge = hold(createQuality('high'), DOWNGRADE_FPS, DOWNGRADE_AFTER_MS * 2)
    expect(edge.tier).toBe('high')
  })
})

describe('자동 승격', () => {
  it('60fps 가 5초 안정되면 올린다', () => {
    const before = hold(createQuality('low'), 60, UPGRADE_AFTER_MS - 200)
    expect(before.tier).toBe('low')
    expect(observeFps(before, 60, 300).state.tier).toBe('medium')
  })

  it('승격이 강등보다 느리다 — 경계에서 깜빡이지 않게', () => {
    expect(UPGRADE_AFTER_MS).toBeGreaterThan(DOWNGRADE_AFTER_MS)
  })

  it('가장 높은 티어에서는 더 올라가지 않는다', () => {
    expect(hold(createQuality('high'), 60, 30000).tier).toBe('high')
  })

  it('경계 아래면 승격하지 않는다', () => {
    expect(hold(createQuality('low'), UPGRADE_FPS - 1, 30000).tier).toBe('low')
  })
})

describe('수동 설정이 자동 조정을 이긴다', () => {
  it('직접 고르면 프레임이 무너져도 유지된다', () => {
    // 설정이 멋대로 바뀌는 것만큼 나쁜 경험이 없다.
    const manual = setManual(createQuality('high'), 'high')
    expect(hold(manual, 10, 30000).tier).toBe('high')
  })

  it('직접 고르면 승격도 하지 않는다', () => {
    const manual = setManual(createQuality('low'), 'low')
    expect(hold(manual, 60, 30000).tier).toBe('low')
  })

  it('자동 조정을 다시 켤 수 있다', () => {
    const manual = setManual(createQuality('high'), 'high')
    const auto = clearManual(manual)
    expect(auto.manual).toBe(false)
    expect(hold(auto, 10, 5000).tier).toBe('medium')
  })
})

describe('느린 2차 강등 — 게이트가 재는 선', () => {
  it('45fps 로 계속 돌면 결국 내려간다 — 1차 규칙만으로는 안 잡힌다', () => {
    const start = createQuality('high')
    const soon = hold(start, 45, DOWNGRADE_AFTER_MS + 500)
    expect(soon.tier).toBe('high')

    const later = hold(start, 45, SLOW_DOWNGRADE_AFTER_MS + 500)
    expect(later.tier).toBe('medium')
  })

  it('잠깐의 하락으로는 내려가지 않는다 — 화면이 오르내리면 연출이 나빠진다', () => {
    const dipped = hold(createQuality('high'), 45, SLOW_DOWNGRADE_AFTER_MS / 2)
    const recovered = hold(dipped, 60, 1000)
    expect(hold(recovered, 45, SLOW_DOWNGRADE_AFTER_MS / 2 + 500).tier).toBe('high')
  })

  it('게이트가 재는 선(50fps) 위에서는 건드리지 않는다', () => {
    const fine = hold(createQuality('high'), SLOW_DOWNGRADE_FPS + 1, SLOW_DOWNGRADE_AFTER_MS * 2)
    expect(fine.tier).toBe('high')
  })

  it('1차 규칙이 여전히 더 빠르다 — 심한 저하는 3초에 잡는다', () => {
    const bad = hold(createQuality('high'), DOWNGRADE_FPS - 5, DOWNGRADE_AFTER_MS + 100)
    expect(bad.tier).toBe('medium')
  })

  it('직접 고른 뒤에는 2차 규칙도 멈춘다', () => {
    const manual = setManual(createQuality('high'), 'high')
    expect(hold(manual, 45, SLOW_DOWNGRADE_AFTER_MS * 2).tier).toBe('high')
  })
})
