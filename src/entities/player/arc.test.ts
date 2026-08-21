import { describe, expect, it } from 'vitest'
import { TICK_SECONDS, TILE_SIZE } from '../../core/config.ts'
import { loadBalance } from '../../data/load.ts'
import { distanceInTiles, simulateJumpArc } from './arc.ts'

const balance = loadBalance().player

describe('점프 궤도', () => {
  const arc = simulateJumpArc(balance, { dt: TICK_SECONDS })

  it('docs/02 의 실측값과 일치한다', () => {
    expect(arc.maxHeight).toBeCloseTo(62.3, 1)
    expect(arc.distance).toBeCloseTo(62.3, 1)
    expect(arc.airFrames).toBe(34)
    expect(arc.airSeconds).toBeCloseTo(0.567, 3)
  })

  it('레벨 디자인 기준은 3.9타일이다', () => {
    expect(distanceInTiles(arc, TILE_SIZE)).toBeCloseTo(3.9, 1)
  })

  it('프레임마다 점 하나씩 남긴다 — 오버레이가 그대로 그린다', () => {
    expect(arc.points).toHaveLength(arc.airFrames + 1)
    expect(arc.points[0]).toEqual({ frame: 0, x: 0, y: 0 })
  })

  it('올라갔다 내려온다', () => {
    const ys = arc.points.map((pt) => pt.y)
    const lowest = Math.min(...ys)
    const apexIndex = ys.indexOf(lowest)
    expect(apexIndex).toBeGreaterThan(0)
    expect(apexIndex).toBeLessThan(ys.length - 1)
    expect(ys[ys.length - 1]).toBeGreaterThanOrEqual(0)
  })

  it('수평 속도가 상수다 — 고정 궤도의 정의', () => {
    const steps = arc.points.slice(1).map((pt, i) => pt.x - (arc.points[i]?.x ?? 0))
    for (const step of steps) expect(step).toBeCloseTo(balance.runSpeed * TICK_SECONDS, 9)
  })

  it('수평 속도만 바꾸면 높이는 그대로다', () => {
    const still = simulateJumpArc(balance, { horizontalSpeed: 0, dt: TICK_SECONDS })
    expect(still.maxHeight).toBeCloseTo(arc.maxHeight, 9)
    expect(still.distance).toBe(0)
    expect(still.airFrames).toBe(arc.airFrames)
  })

  it('거리가 속도에 비례한다', () => {
    const half = simulateJumpArc(balance, { horizontalSpeed: balance.runSpeed / 2, dt: TICK_SECONDS })
    expect(half.distance).toBeCloseTo(arc.distance / 2, 6)
  })

  it('착지하지 않는 수치는 거부한다', () => {
    const broken = { ...balance, gravityRising: 0, gravityFalling: 0 }
    expect(() => simulateJumpArc(broken, { maxFrames: 100 })).toThrow(/착지하지 않는다/)
  })
})
