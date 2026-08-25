import { describe, expect, it } from 'vitest'
import {
  BUCKETS, EMPTY_FRAMES, FRAME_DISCARD_MS, FRAME_HELD_MS, WARMUP_FRAMES,
  averageFps, heldRate, percentileMs, pushFrame,
} from './frames.ts'

/** 워밍업을 지난 상태를 만든다. */
function warmed(ms = 16): ReturnType<typeof pushFrame> {
  let stats = EMPTY_FRAMES
  for (let i = 0; i < WARMUP_FRAMES; i += 1) stats = pushFrame(stats, ms)
  return stats
}

describe('프레임 집계', () => {
  it('워밍업 구간은 버린다 — 셰이더 컴파일이 유지율을 깎으면 안 된다', () => {
    let stats = EMPTY_FRAMES
    for (let i = 0; i < WARMUP_FRAMES; i += 1) stats = pushFrame(stats, 400)

    expect(stats.samples).toBe(0)
    expect(stats.discarded).toBe(WARMUP_FRAMES)
  })

  it('워밍업이 끝나면 집계에 들어간다', () => {
    const stats = pushFrame(warmed(), 16)
    expect(stats.samples).toBe(1)
    expect(stats.held).toBe(1)
  })

  it('탭 전환으로 생긴 긴 간격은 끊김이 아니다', () => {
    const stats = pushFrame(warmed(), FRAME_DISCARD_MS + 1000)

    expect(stats.samples).toBe(0)
    expect(stats.discarded).toBe(WARMUP_FRAMES + 1)
    expect(stats.worstMs).toBe(0)
  })

  it('경계값 — 유지 판정은 이하까지 포함한다', () => {
    expect(pushFrame(warmed(), FRAME_HELD_MS).held).toBe(1)
    expect(pushFrame(warmed(), FRAME_HELD_MS + 0.1).held).toBe(0)
  })

  it('음수·NaN 은 버린다', () => {
    expect(pushFrame(warmed(), -1).samples).toBe(0)
    expect(pushFrame(warmed(), Number.NaN).samples).toBe(0)
  })

  it('유지율을 센다', () => {
    let stats = warmed()
    for (let i = 0; i < 95; i += 1) stats = pushFrame(stats, 16)
    for (let i = 0; i < 5; i += 1) stats = pushFrame(stats, 33)

    expect(stats.samples).toBe(100)
    expect(heldRate(stats)).toBeCloseTo(0.95, 5)
  })

  it('표본이 없으면 유지율은 0 이다 — 100% 라고 하면 거짓말이다', () => {
    expect(heldRate(EMPTY_FRAMES)).toBe(0)
    expect(averageFps(EMPTY_FRAMES)).toBe(0)
    expect(percentileMs(EMPTY_FRAMES, 0.95)).toBe(0)
  })

  it('백분위를 히스토그램에서 뽑는다', () => {
    let stats = warmed()
    for (let i = 0; i < 90; i += 1) stats = pushFrame(stats, 10)
    for (let i = 0; i < 10; i += 1) stats = pushFrame(stats, 30)

    expect(percentileMs(stats, 0.5)).toBe(11)
    expect(percentileMs(stats, 0.95)).toBe(31)
  })

  it('넘침 칸에 걸리면 실측 최악값을 돌려준다 — 63ms 라고 하지 않는다', () => {
    let stats = warmed()
    for (let i = 0; i < 10; i += 1) stats = pushFrame(stats, 200)

    expect(stats.buckets[BUCKETS - 1]).toBe(10)
    expect(percentileMs(stats, 0.99)).toBe(200)
    expect(stats.worstMs).toBe(200)
  })

  it('평균 fps 를 역산한다', () => {
    let stats = warmed()
    for (let i = 0; i < 100; i += 1) stats = pushFrame(stats, 16.6)

    // 16 칸(대표값 16.5ms) → 60.6fps
    expect(averageFps(stats)).toBeGreaterThan(58)
    expect(averageFps(stats)).toBeLessThan(62)
  })

  it('원본을 바꾸지 않는다', () => {
    const before = warmed()
    const snapshot = before.buckets.slice()
    pushFrame(before, 16)

    expect(before.buckets).toEqual(snapshot)
    expect(before.samples).toBe(0)
  })
})
