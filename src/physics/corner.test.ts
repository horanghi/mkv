import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../core/config.ts'
import { createBody, resolve } from './body.ts'
import { cornerCorrect, isStuck, overlapsBlocking } from './corner.ts'
import { parseTilemap } from './tilemap.ts'

/**
 * ```
 *      0   16  32  48  64  80  96  112
 *  0   .   .   #   .   .   .   .   .    천장 블록
 *  16  .   .   .   .   .   .   #   #
 *  32  .   .   .   .   .   .   #   #
 *  48  #   #   #   #   #   #   #   #
 * ```
 */
const MAP = parseTilemap([
  '..#.....',
  '......##',
  '......##',
  '########',
])

const W = 12
const H = 26

describe('모서리 보정', () => {
  it('1px 만 걸렸으면 옆으로 밀어 통과시킨다', () => {
    // x 21~33 — 천장 타일(32~48)과 1px 겹친다.
    const rising = createBody(21, 20, W, H, { vy: -600 })
    expect(resolve(rising, MAP, TICK_SECONDS).body.hitCeiling).toBe(true)

    const corrected = cornerCorrect(rising, MAP, TICK_SECONDS, 3)
    expect(corrected.nudge).toBe(-1)
    expect(resolve(corrected.body, MAP, TICK_SECONDS).body.hitCeiling).toBe(false)
  })

  it('보정 폭을 넘게 걸렸으면 그대로 막힌다', () => {
    // x 25~37 — 5px 겹친다. 3px 로는 못 뺀다.
    const rising = createBody(25, 20, W, H, { vy: -600 })
    const corrected = cornerCorrect(rising, MAP, TICK_SECONDS, 3)
    expect(corrected.nudge).toBe(0)
    expect(corrected.body).toBe(rising)
  })

  it('진행 방향을 먼저 시도한다', () => {
    // 오른쪽으로 가는 중이면 오른쪽으로 빠지는 것이 자연스럽다.
    // 이번 틱의 X 이동(1px)까지 더해 x 45~57 이 되어 천장(32~48)과 3px 겹친다.
    const rising = createBody(44, 20, W, H, { vx: 60, vy: -600 })
    const corrected = cornerCorrect(rising, MAP, TICK_SECONDS, 3)
    expect(corrected.nudge).toBe(3)
    expect(corrected.body.x).toBe(47)
    expect(resolve(corrected.body, MAP, TICK_SECONDS).body.hitCeiling).toBe(false)
  })

  it('왼쪽으로 가는 중이면 왼쪽을 먼저 시도한다', () => {
    // X 이동(-1px)까지 더해 x 23~35 가 되어 천장(32~48)과 3px 겹친다.
    const rising = createBody(24, 20, W, H, { vx: -60, vy: -600 })
    const corrected = cornerCorrect(rising, MAP, TICK_SECONDS, 3)
    expect(corrected.nudge).toBe(-3)
    expect(resolve(corrected.body, MAP, TICK_SECONDS).body.hitCeiling).toBe(false)
  })

  it('수평 속도를 건드리지 않는다 — 고정 궤도 규칙', () => {
    const rising = createBody(21, 20, W, H, { vx: 110, vy: -600 })
    const corrected = cornerCorrect(rising, MAP, TICK_SECONDS, 3)
    expect(corrected.body.vx).toBe(110)
    expect(corrected.body.vy).toBe(-600)
  })

  it('상승 중이 아니면 아무것도 하지 않는다', () => {
    const falling = createBody(21, 20, W, H, { vy: 600 })
    expect(cornerCorrect(falling, MAP, TICK_SECONDS, 3).nudge).toBe(0)

    const still = createBody(21, 20, W, H)
    expect(cornerCorrect(still, MAP, TICK_SECONDS, 3).nudge).toBe(0)
  })

  it('천장에 안 걸리면 아무것도 하지 않는다', () => {
    const clear = createBody(64, 20, W, H, { vy: -600 })
    expect(cornerCorrect(clear, MAP, TICK_SECONDS, 3).nudge).toBe(0)
  })

  it('벽 쪽으로는 밀지 않는다', () => {
    // 오른쪽에 벽(96~128)이 있어 그쪽으로 밀면 벽에 박힌다.
    const rising = createBody(88, 40, W, H, { vy: -600 })
    const corrected = cornerCorrect(rising, MAP, TICK_SECONDS, 3)
    expect(corrected.body.x).toBeLessThanOrEqual(88)
  })

  it('보정 폭이 0 이면 보정하지 않는다', () => {
    const rising = createBody(21, 20, W, H, { vy: -600 })
    expect(cornerCorrect(rising, MAP, TICK_SECONDS, 0).nudge).toBe(0)
  })
})

describe('머리 공간 확인', () => {
  it('막는 타일과 겹치면 참이다', () => {
    expect(overlapsBlocking({ x: 33, y: 4, width: 8, height: 8 }, MAP)).toBe(true)
  })

  it('빈칸이면 거짓이다', () => {
    expect(overlapsBlocking({ x: 0, y: 0, width: 8, height: 8 }, MAP)).toBe(false)
  })

  it('통과 가능한 타일은 막는 것으로 치지 않는다', () => {
    // 원웨이 발판 아래에서는 일어설 수 있어야 한다.
    const passable = parseTilemap(['-^'])
    expect(overlapsBlocking({ x: 4, y: 4, width: 8, height: 8 }, passable)).toBe(false)
    expect(overlapsBlocking({ x: 20, y: 4, width: 8, height: 8 }, passable)).toBe(false)
  })

  it('지형에 낀 바디를 알아본다', () => {
    expect(isStuck(createBody(33, 50, W, H), MAP)).toBe(true)
    expect(isStuck(createBody(0, 22, W, H), MAP)).toBe(false)
  })
})
