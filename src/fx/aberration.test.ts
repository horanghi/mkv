import { describe, expect, it } from 'vitest'
import {
  ABERRATION,
  ABERRATION_EVENTS,
  NO_ABERRATION,
  isActive,
  pixelOffset,
  step,
  strengthOf,
  trigger,
  type AberrationState,
} from './aberration.ts'

function peakOf(event: Parameters<typeof trigger>[1]): number {
  let state = trigger(NO_ABERRATION, event)
  let max = 0
  for (let i = 0; i < 200; i += 1) {
    max = Math.max(max, strengthOf(state))
    state = step(state, 5)
  }
  return max
}

describe('수치 — docs/06 6.4 표', () => {
  it('네 이벤트의 최대 강도와 지속이 표와 같다', () => {
    expect(ABERRATION.armorBreak).toEqual({ peak: 0.8, durationMs: 140 })
    expect(ABERRATION.bossEntrance).toEqual({ peak: 1.2, durationMs: 600 })
    expect(ABERRATION.sigil).toEqual({ peak: 0.5, durationMs: 200 })
    expect(ABERRATION.phaseShift).toEqual({ peak: 1.5, durationMs: 800 })
  })

  it('실제 강도가 표의 최대치에 닿는다', () => {
    for (const event of ABERRATION_EVENTS) {
      expect(peakOf(event)).toBeCloseTo(ABERRATION[event].peak, 1)
    }
  })
})

describe('상시 적용 금지', () => {
  it('기본 상태는 꺼져 있다', () => {
    expect(strengthOf(NO_ABERRATION)).toBe(0)
    expect(isActive(NO_ABERRATION)).toBe(false)
  })

  it('지속 시간이 지나면 완전히 사라진다', () => {
    let state = trigger(NO_ABERRATION, 'armorBreak')
    for (let i = 0; i < 50; i += 1) state = step(state, 10)
    expect(state).toBe(NO_ABERRATION)
    expect(isActive(state)).toBe(false)
  })
})

describe('강도 곡선 — 솟았다 빠진다', () => {
  it('시작은 0 이다', () => {
    expect(strengthOf(trigger(NO_ABERRATION, 'armorBreak'))).toBe(0)
  })

  it('앞에서 빠르게 솟고 뒤에서 길게 빠진다', () => {
    // 즉시 최대로 켜고 서서히 끄면 "켜졌다 꺼졌다"로 읽힌다.
    let state = trigger(NO_ABERRATION, 'phaseShift')
    const samples: number[] = []
    for (let i = 0; i < 16; i += 1) {
      samples.push(strengthOf(state))
      state = step(state, 50)
    }
    const peakIndex = samples.indexOf(Math.max(...samples))
    expect(peakIndex).toBeGreaterThan(0)
    expect(peakIndex).toBeLessThan(samples.length / 2)
  })

  it('단조 증가 후 단조 감소다', () => {
    let state = trigger(NO_ABERRATION, 'bossEntrance')
    const samples: number[] = []
    for (let i = 0; i < 60; i += 1) {
      samples.push(strengthOf(state))
      state = step(state, 10)
    }
    const peak = samples.indexOf(Math.max(...samples))
    for (let i = 1; i <= peak; i += 1) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!)
    for (let i = peak + 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]!)
    }
  })
})

describe('겹침 — 강한 쪽이 이긴다', () => {
  it('약한 이벤트가 강한 것을 밀어내지 못한다', () => {
    // 보스 등장 중 갑옷이 깨졌다고 화면이 찢어지면 안 된다.
    const strong = trigger(NO_ABERRATION, 'phaseShift')
    expect(trigger(strong, 'sigil')).toBe(strong)
  })

  it('강한 이벤트는 덮어쓴다', () => {
    const weak = trigger(NO_ABERRATION, 'sigil')
    const strong = trigger(weak, 'phaseShift')
    expect(strong.peak).toBe(ABERRATION.phaseShift.peak)
    expect(strong.elapsedMs).toBe(0)
  })
})

describe('셰이더 입력', () => {
  it('강도 1.0 이 약 4px 분리다', () => {
    const full: AberrationState = { peak: 4, durationMs: 100, elapsedMs: 25 }
    expect(pixelOffset(full)).toBeCloseTo(16)
  })

  it('꺼져 있으면 0px 다', () => {
    expect(pixelOffset(NO_ABERRATION)).toBe(0)
  })
})

describe('경계', () => {
  it('음수 시간은 무시한다', () => {
    const state = trigger(NO_ABERRATION, 'armorBreak')
    expect(step(state, -100).elapsedMs).toBe(0)
  })

  it('꺼진 상태를 진행해도 꺼져 있다', () => {
    expect(step(NO_ABERRATION, 100)).toBe(NO_ABERRATION)
  })
})

describe('겹침 — 남은 잠재 강도로 비교한다', () => {
  it('방금 시작한 강한 이벤트를 약한 것이 밀어내지 못한다', () => {
    // 시작 순간 강도는 0 이다. 현재값으로 비교하면 약한 쪽이 이겨버린다.
    const fresh = trigger(NO_ABERRATION, 'phaseShift')
    expect(strengthOf(fresh)).toBe(0)
    expect(trigger(fresh, 'sigil')).toBe(fresh)
  })

  it('거의 끝난 강한 이벤트는 약한 것에 자리를 내준다', () => {
    let fading = trigger(NO_ABERRATION, 'phaseShift')
    for (let i = 0; i < 15; i += 1) fading = step(fading, 50)
    const taken = trigger(fading, 'sigil')
    expect(taken.peak).toBe(ABERRATION.sigil.peak)
  })

  it('같은 이벤트를 다시 걸면 처음부터 다시 간다', () => {
    let state = trigger(NO_ABERRATION, 'armorBreak')
    state = step(state, 60)
    expect(trigger(state, 'armorBreak').elapsedMs).toBe(0)
  })
})
