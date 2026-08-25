import { describe, expect, it } from 'vitest'
import { NO_SHAKE, isShaking, shakeOffset, startShake, stepShake, strongest } from './camera.ts'

describe('셰이크', () => {
  it('시작하면 흔들린다', () => {
    expect(isShaking(startShake(6, 300, 28))).toBe(true)
    expect(isShaking(NO_SHAKE)).toBe(false)
  })

  it('시간이 지나면 멈춘다', () => {
    let shake = startShake(6, 300, 28)
    for (let i = 0; i < 30; i += 1) shake = stepShake(shake, 16)
    expect(isShaking(shake)).toBe(false)
    expect(shakeOffset(shake)).toEqual({ x: 0, y: 0 })
  })

  it('진폭을 넘지 않는다', () => {
    let shake = startShake(6, 300, 28)
    for (let i = 0; i < 20; i += 1) {
      const o = shakeOffset(shake)
      expect(Math.abs(o.x)).toBeLessThanOrEqual(6)
      expect(Math.abs(o.y)).toBeLessThanOrEqual(6)
      shake = stepShake(shake, 16)
    }
  })

  it('ease-out 으로 감쇠한다 — 선형이면 끝이 뚝 끊긴다', () => {
    const early = startShake(10, 300, 28)
    let late = early
    for (let i = 0; i < 15; i += 1) late = stepShake(late, 16)

    const peak = (shake: typeof early) => {
      let max = 0
      let s = shake
      for (let i = 0; i < 6; i += 1) {
        max = Math.max(max, Math.abs(shakeOffset(s).x))
        s = stepShake(s, 4)
      }
      return max
    }
    expect(peak(late)).toBeLessThan(peak(early))
  })

  it('정수 픽셀로 흔든다 — 픽셀 격자를 벗어나지 않는다', () => {
    let shake = startShake(6, 300, 28)
    for (let i = 0; i < 20; i += 1) {
      const o = shakeOffset(shake)
      expect(Number.isInteger(o.x)).toBe(true)
      expect(Number.isInteger(o.y)).toBe(true)
      shake = stepShake(shake, 7)
    }
  })

  it('x 와 y 의 주파수가 어긋난다 — 같으면 대각선 미끄러짐이 된다', () => {
    let shake = startShake(20, 1000, 20)
    const pairs: string[] = []
    for (let i = 0; i < 30; i += 1) {
      const o = shakeOffset(shake)
      pairs.push(`${Math.sign(o.x)}${Math.sign(o.y)}`)
      shake = stepShake(shake, 8)
    }
    // 부호 조합이 네 가지 다 나오면 대각선 왕복이 아니다
    expect(new Set(pairs).size).toBeGreaterThan(2)
  })

  it('길이가 0이면 흔들지 않는다', () => {
    expect(stepShake(startShake(6, 0, 28), 16)).toBe(NO_SHAKE)
  })

  it('음수 시간은 무시한다', () => {
    const shake = startShake(6, 300, 28)
    expect(stepShake(shake, -100).elapsedMs).toBe(0)
  })
})

describe('겹침', () => {
  it('강한 쪽만 쓴다 — 더하면 화면이 튀어 나간다', () => {
    const weak = startShake(3, 300, 28)
    const strong = startShake(10, 300, 22)
    expect(strongest(weak, strong)).toBe(strong)
    expect(strongest(strong, weak)).toBe(strong)
  })

  it('끝난 셰이크는 지지 않는다', () => {
    let done = startShake(20, 100, 28)
    for (let i = 0; i < 10; i += 1) done = stepShake(done, 16)
    const fresh = startShake(3, 300, 28)
    expect(strongest(done, fresh)).toBe(fresh)
  })
})
