import { describe, expect, it } from 'vitest'
import type { ArmorState } from '../sprite/armor.ts'
import {
  BOSS_HIT_SCORE, KILL_SCORE, cleanSections, createRun, stepRun, type RunStats,
} from './runStats.ts'
import type { WorldEvents } from './world.ts'

const QUIET: WorldEvents = {
  armorBroke: false, died: false, hurt: false, enemiesKilled: 0,
  bossHit: 0, bossKilled: false, quake: false, fired: false, landed: false,
  grimmTookOff: false, chestOpened: false, pickedUp: null, gameOver: false, cause: null,
}

function run(
  stats: RunStats,
  patch: Partial<WorldEvents>,
  sectionIndex = 0,
  armor: ArmorState = 'steel',
): RunStats {
  return stepRun(stats, { events: { ...QUIET, ...patch }, sectionIndex, armor })
}

describe('한 판 집계', () => {
  it('구간 수만큼 노히트 칸을 만든다', () => {
    expect(createRun(3).hitSections).toEqual([false, false, false])
  })

  it('구간이 0 이어도 최소 하나는 둔다', () => {
    expect(createRun(0).hitSections).toHaveLength(1)
  })

  it('처치와 보스 타격을 점수로 센다 — docs/02 2.7', () => {
    let s = createRun(3)
    s = run(s, { enemiesKilled: 2 })
    s = run(s, { bossHit: 10 })

    expect(s.enemiesKilled).toBe(2)
    expect(s.score).toBe(2 * KILL_SCORE + 10 * BOSS_HIT_SCORE)
  })

  it('맞은 구간을 표시한다', () => {
    let s = createRun(3)
    s = run(s, { hurt: true }, 1)

    expect(s.hitSections).toEqual([false, true, false])
    expect(cleanSections(s)).toBe(2)
  })

  it('사망도 그 구간을 더럽힌다', () => {
    const s = run(createRun(3), { died: true }, 2)
    expect(s.hitSections).toEqual([false, false, true])
  })

  it('같은 구간에서 두 번 맞아도 한 번이다', () => {
    let s = run(createRun(3), { hurt: true }, 0)
    const before = s.hitSections
    s = run(s, { hurt: true }, 0)

    expect(s.hitSections).toBe(before)
  })

  it('구간 번호가 범위를 벗어나도 터지지 않는다', () => {
    expect(run(createRun(2), { hurt: true }, 99).hitSections).toEqual([false, true])
    expect(run(createRun(2), { hurt: true }, -5).hitSections).toEqual([true, false])
  })

  it('성유물을 입고 끝까지 가면 유지다', () => {
    let s = createRun(1)
    for (let i = 0; i < 5; i += 1) s = run(s, {}, 0, 'relic')

    expect(s.hadRelic).toBe(true)
    expect(s.relicKept).toBe(true)
  })

  it('한 번 잃으면 다시 주워도 유지가 아니다', () => {
    let s = createRun(1)
    s = run(s, {}, 0, 'relic')
    expect(s.relicKept).toBe(true)

    s = run(s, {}, 0, 'steel')
    expect(s.relicKept).toBe(false)

    s = run(s, {}, 0, 'relic')
    expect(s.relicKept).toBe(false)
    expect(s.hadRelic).toBe(true)
  })

  it('성유물을 입어 본 적이 없으면 잃은 것도 아니다', () => {
    const s = run(createRun(1), {}, 0, 'steel')
    expect(s.hadRelic).toBe(false)
    expect(s.relicKept).toBe(false)
  })

  it('틱을 센다', () => {
    let s = createRun(1)
    for (let i = 0; i < 60; i += 1) s = run(s, {})
    expect(s.ticks).toBe(60)
  })

  it('원본을 바꾸지 않는다', () => {
    const before = createRun(3)
    run(before, { hurt: true, enemiesKilled: 3 }, 1)

    expect(before.hitSections).toEqual([false, false, false])
    expect(before.score).toBe(0)
  })
})
