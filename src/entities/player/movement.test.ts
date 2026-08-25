import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../../core/config.ts'
import { loadBalance } from '../../data/load.ts'
import { approach, stepGravity, stepHorizontal } from './movement.ts'

const p = loadBalance().player
const dt = TICK_SECONDS

describe('approach', () => {
  it('목표를 넘어서지 않는다', () => {
    expect(approach(0, 10, 1000, dt)).toBeCloseTo(10)
    expect(approach(0, 10, 60, dt)).toBeCloseTo(1)
  })

  it('양방향 모두 동작한다', () => {
    expect(approach(0, -10, 60, dt)).toBeCloseTo(-1)
  })

  it('이미 목표면 그대로다', () => {
    expect(approach(5, 5, 900, dt)).toBe(5)
  })

  it('속도가 0 이면 움직이지 않는다', () => {
    expect(approach(3, 100, 0, dt)).toBe(3)
  })
})

describe('지상 수평 이동', () => {
  it('약 7프레임에 최대 속도에 닿는다 — docs/02 2.2', () => {
    let vx = 0
    let frames = 0
    while (vx < p.runSpeed && frames < 60) {
      vx = stepHorizontal(vx, 1, true, false, p, dt)
      frames += 1
    }
    expect(vx).toBe(p.runSpeed)
    expect(frames).toBe(8)
  })

  it('약 5프레임에 멈춘다', () => {
    let vx = p.runSpeed
    let frames = 0
    while (vx > 0 && frames < 60) {
      vx = stepHorizontal(vx, 0, true, false, p, dt)
      frames += 1
    }
    expect(vx).toBe(0)
    expect(frames).toBe(5)
  })

  it('감속이 가속보다 빠르다 — 멈춤이 즉각적으로 읽혀야 한다', () => {
    expect(p.decel).toBeGreaterThan(p.accel)
  })

  it('방향 전환에 딜레이가 없다', () => {
    const turning = stepHorizontal(p.runSpeed, -1, true, false, p, dt)
    expect(turning).toBeLessThan(p.runSpeed)
  })

  it('웅크린 채로는 걷지 않는다', () => {
    let vx = p.runSpeed
    for (let i = 0; i < 10; i += 1) vx = stepHorizontal(vx, 1, true, true, p, dt)
    expect(vx).toBe(0)
  })
})

describe('공중 수평 이동 — 고정 점프 궤도', () => {
  it('공중에서 방향키를 눌러도 속도가 변하지 않는다', () => {
    // GOAL 비협상 원칙 1. 이 테스트가 깨지면 게임의 정체성이 깨진 것이다.
    const takeoff = p.runSpeed
    expect(stepHorizontal(takeoff, -1, false, false, p, dt)).toBe(takeoff)
    expect(stepHorizontal(takeoff, 0, false, false, p, dt)).toBe(takeoff)
    expect(stepHorizontal(takeoff, 1, false, false, p, dt)).toBe(takeoff)
  })

  it('여러 프레임을 눌러도 마찬가지다', () => {
    let vx = -p.runSpeed
    for (let i = 0; i < 60; i += 1) vx = stepHorizontal(vx, 1, false, false, p, dt)
    expect(vx).toBe(-p.runSpeed)
  })
})

describe('중력', () => {
  it('상승과 하강의 중력이 다르다', () => {
    const rising = stepGravity(-100, p, dt)
    const falling = stepGravity(100, p, dt)
    expect(rising - -100).toBeCloseTo(p.gravityRising * dt)
    expect(falling - 100).toBeCloseTo(p.gravityFalling * dt)
  })

  it('최대 낙하 속도를 넘지 않는다', () => {
    let vy = 0
    for (let i = 0; i < 200; i += 1) vy = stepGravity(vy, p, dt)
    expect(vy).toBe(p.maxFallSpeed)
  })

  it('정점에서 하강 중력으로 넘어간다', () => {
    // vy 가 0 이 되는 순간부터 무거워진다.
    expect(stepGravity(0, p, dt)).toBeCloseTo(p.gravityFalling * dt)
  })
})

describe('갑옷 속도 보정', () => {
  it('속옷은 8% 빠르다', () => {
    let vx = 0
    for (let i = 0; i < 60; i += 1) vx = stepHorizontal(vx, 1, true, false, p, dt, 1.08)
    expect(vx).toBeCloseTo(p.runSpeed * 1.08)
  })

  it('배율을 안 주면 기본 속도다', () => {
    let vx = 0
    for (let i = 0; i < 60; i += 1) vx = stepHorizontal(vx, 1, true, false, p, dt)
    expect(vx).toBe(p.runSpeed)
  })

  it('공중에서도 배율이 적용된다 — 다만 airAccel 이 0 이라 변하지 않는다', () => {
    const takeoff = p.runSpeed * 1.08
    expect(stepHorizontal(takeoff, -1, false, false, p, dt, 1.08)).toBe(takeoff)
  })
})
