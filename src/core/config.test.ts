import { describe, expect, it } from 'vitest'
import {
  BLOOM_RT_SCALES,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_CATCHUP_TICKS,
  TICK_MS,
  TICK_RATE,
  TILES_ACROSS,
  TILES_DOWN,
  TILE_SIZE,
  framesToSeconds,
  secondsToFrames,
} from './config.ts'

describe('엔진 상수', () => {
  it('논리 해상도와 타일 크기가 GOAL 비협상 원칙 6과 일치한다', () => {
    expect(LOGICAL_WIDTH).toBe(480)
    expect(LOGICAL_HEIGHT).toBe(270)
    expect(TILE_SIZE).toBe(16)
  })

  it('논리 해상도가 타일 크기로 나누어떨어진다', () => {
    // 나머지가 생기면 화면 끝에 반쪽 타일이 남는다.
    expect(LOGICAL_WIDTH % TILE_SIZE).toBe(0)
    expect(TILES_ACROSS).toBe(30)
    // 270 / 16 은 나누어떨어지지 않는다 — 세로는 16.875 타일이고, 이는 의도된 값이다.
    expect(TILES_DOWN).toBeCloseTo(16.875)
  })

  it('틱 레이트가 60Hz 다', () => {
    expect(TICK_RATE).toBe(60)
    expect(TICK_MS).toBeCloseTo(16.667, 3)
  })

  it('캐치업 상한이 있다 — 죽음의 나선 방지', () => {
    expect(MAX_CATCHUP_TICKS).toBeGreaterThan(0)
    expect(MAX_CATCHUP_TICKS).toBeLessThanOrEqual(10)
  })

  it('블룸 다운샘플이 단조 감소한다', () => {
    const scales = [...BLOOM_RT_SCALES]
    expect(scales).toEqual([...scales].sort((a, b) => b - a))
  })
})

describe('프레임 · 초 환산', () => {
  it('프레임을 초로 바꾼다', () => {
    expect(framesToSeconds(60)).toBeCloseTo(1)
    // 코요테 타임 5프레임 = 83ms (docs/02 2.2)
    expect(framesToSeconds(5) * 1000).toBeCloseTo(83.3, 1)
  })

  it('초를 프레임으로 바꾼다 — 내림', () => {
    expect(secondsToFrames(1)).toBe(60)
    expect(secondsToFrames(0.1)).toBe(6)
    expect(secondsToFrames(0.0999)).toBe(5)
  })

  it('왕복해도 값이 유지된다', () => {
    for (const f of [1, 5, 6, 72, 90, 180]) {
      expect(secondsToFrames(framesToSeconds(f))).toBe(f)
    }
  })
})
