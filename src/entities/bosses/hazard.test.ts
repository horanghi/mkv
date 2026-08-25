import { describe, expect, it } from 'vitest'
import { parseTilemap } from '../../physics/tilemap.ts'
import {
  EMPTY_HAZARDS, MAX_HAZARDS, boxOfHazard, clearHazards, spawnHazard, stepHazards,
} from './hazard.ts'

const GRAVITY = 1750
const DT = 1 / 60

/** 바닥만 있는 맵. 높이 10타일. */
const FLAT = parseTilemap([
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '####################',
])

describe('보스 위험물', () => {
  it('중심 좌표로 놓으면 상자가 그 자리에 온다', () => {
    const w = spawnHazard(EMPTY_HAZARDS, 'rock', { x: 100, y: 50 })
    const box = boxOfHazard(w.hazards[0]!)

    expect(box.x + box.width / 2).toBe(100)
    expect(box.y + box.height / 2).toBe(50)
  })

  it('묘비는 던진 속도를 갖고, 낙석은 아래로 떨어진다', () => {
    const g = spawnHazard(EMPTY_HAZARDS, 'gravestone', { x: 0, y: 0, vx: -140, vy: -170 })
    expect(g.hazards[0]!.vx).toBe(-140)
    expect(g.hazards[0]!.vy).toBe(-170)

    const r = spawnHazard(EMPTY_HAZARDS, 'rock', { x: 0, y: 0 })
    expect(r.hazards[0]!.vx).toBe(0)
    expect(r.hazards[0]!.vy).toBeGreaterThan(0)
  })

  it('중력을 받는다', () => {
    let w = spawnHazard(EMPTY_HAZARDS, 'gravestone', { x: 100, y: 20, vx: 0, vy: 0 })
    const before = w.hazards[0]!.y
    w = stepHazards(w, FLAT, GRAVITY, DT)

    expect(w.hazards[0]!.y).toBeGreaterThan(before)
  })

  it('바닥에 닿으면 부서진다', () => {
    let w = spawnHazard(EMPTY_HAZARDS, 'rock', { x: 100, y: 20 })
    for (let i = 0; i < 120 && w.hazards.length > 0; i += 1) {
      w = stepHazards(w, FLAT, GRAVITY, DT)
    }
    expect(w.hazards).toHaveLength(0)
  })

  it('얇은 지형을 뚫지 않는다 — 빠르게 떨어져도 바닥에서 멈춘다', () => {
    // 서브스텝이 없으면 한 틱에 타일을 지나쳐 화면 밖까지 간다.
    let w = spawnHazard(EMPTY_HAZARDS, 'rock', { x: 100, y: 10, vy: 4000 })
    for (let i = 0; i < 10 && w.hazards.length > 0; i += 1) {
      w = stepHazards(w, FLAT, GRAVITY, DT)
      for (const h of w.hazards) expect(h.y).toBeLessThan(FLAT.height * FLAT.tileSize)
    }
    expect(w.hazards).toHaveLength(0)
  })

  it('화면 밖으로 나가면 사라진다', () => {
    let w = spawnHazard(EMPTY_HAZARDS, 'gravestone', { x: 20, y: 20, vx: -900, vy: 0 })
    for (let i = 0; i < 60 && w.hazards.length > 0; i += 1) {
      w = stepHazards(w, FLAT, GRAVITY, DT)
    }
    expect(w.hazards).toHaveLength(0)
  })

  it('상한을 넘으면 새로 만들지 않는다 — 오래된 것을 지우면 회피 판단이 무효가 된다', () => {
    let w = EMPTY_HAZARDS
    for (let i = 0; i < MAX_HAZARDS + 5; i += 1) {
      w = spawnHazard(w, 'rock', { x: 50 + i, y: 10 })
    }
    expect(w.hazards).toHaveLength(MAX_HAZARDS)
    // 처음 것들이 남아 있다
    expect(w.hazards[0]!.x).toBe(50 - 5)
  })

  it('id 가 겹치지 않는다', () => {
    let w = EMPTY_HAZARDS
    for (let i = 0; i < 5; i += 1) w = spawnHazard(w, 'rock', { x: 10 * i, y: 10 })
    expect(new Set(w.hazards.map((h) => h.id)).size).toBe(5)
  })

  it('아무 일 없으면 같은 객체를 돌려준다', () => {
    expect(stepHazards(EMPTY_HAZARDS, FLAT, GRAVITY, DT)).toBe(EMPTY_HAZARDS)
  })

  it('전부 치울 수 있다 — 부활·재시작', () => {
    const w = spawnHazard(EMPTY_HAZARDS, 'rock', { x: 10, y: 10 })
    expect(clearHazards(w).hazards).toHaveLength(0)
    expect(clearHazards(EMPTY_HAZARDS)).toBe(EMPTY_HAZARDS)
  })

  it('원본을 바꾸지 않는다', () => {
    const before = spawnHazard(EMPTY_HAZARDS, 'rock', { x: 10, y: 10 })
    const y = before.hazards[0]!.y
    stepHazards(before, FLAT, GRAVITY, DT)

    expect(before.hazards[0]!.y).toBe(y)
    expect(EMPTY_HAZARDS.hazards).toHaveLength(0)
  })
})
