import { describe, expect, it } from 'vitest'
import {
  LINE_ROLL_MS, RANK_THRESHOLDS, TOTAL_ROLL_MS,
  buildResults, formatClock, rankFor, rollingAt, rollingDurationMs,
} from './results.ts'
import {
  KILL_SCORE, NO_HIT_BONUS, RELIC_BONUS, TIME_BONUS_PER_SECOND, createRun, type RunStats,
} from './runStats.ts'

function stats(patch: Partial<RunStats> = {}): RunStats {
  return { ...createRun(3), ...patch }
}

describe('결과 산출', () => {
  it('docs/09 9.4 의 네 줄이 나온다', () => {
    const results = buildResults(stats(), { secondsLeft: 0, enemyTotal: 10 })
    expect(results.lines.map((l) => l.label)).toEqual(['TIME', 'ENEMIES', 'NO-HIT', 'RELIC'])
  })

  it('남은 시간 × 50 이 시간 보너스다 — docs/02 2.7', () => {
    const results = buildResults(stats(), { secondsLeft: 120.9, enemyTotal: 10 })
    const time = results.lines.find((l) => l.key === 'time')!

    expect(time.detail).toBe('02:00')
    expect(time.points).toBe(120 * TIME_BONUS_PER_SECOND)
  })

  it('시간이 다 됐으면 보너스가 없다', () => {
    const results = buildResults(stats(), { secondsLeft: -5, enemyTotal: 10 })
    expect(results.lines[0]!.points).toBe(0)
    expect(results.lines[0]!.detail).toBe('00:00')
  })

  it('처치 수와 점수를 보여준다', () => {
    const results = buildResults(
      stats({ enemiesKilled: 7, score: 7 * KILL_SCORE }),
      { secondsLeft: 0, enemyTotal: 10 },
    )
    const enemies = results.lines.find((l) => l.key === 'enemies')!

    expect(enemies.detail).toBe('7/10')
    expect(enemies.points).toBe(7 * KILL_SCORE)
  })

  it('노히트 구간마다 2000 이다 — docs/02 2.7', () => {
    const clean = buildResults(stats(), { secondsLeft: 0, enemyTotal: 10 })
    expect(clean.lines.find((l) => l.key === 'nohit')!.points).toBe(3 * NO_HIT_BONUS)

    const dirty = buildResults(
      stats({ hitSections: [true, false, true] }),
      { secondsLeft: 0, enemyTotal: 10 },
    )
    const line = dirty.lines.find((l) => l.key === 'nohit')!
    expect(line.points).toBe(NO_HIT_BONUS)
    expect(line.detail).toBe('1 section')
  })

  it('모든 구간에서 맞았으면 표시가 비어 있다', () => {
    const results = buildResults(
      stats({ hitSections: [true, true, true] }),
      { secondsLeft: 0, enemyTotal: 10 },
    )
    expect(results.lines.find((l) => l.key === 'nohit')!.detail).toBe('-')
  })

  it('성유물 유지는 10000 이다 — 잃었으면 0 이다', () => {
    const kept = buildResults(
      stats({ hadRelic: true, relicKept: true }), { secondsLeft: 0, enemyTotal: 10 })
    expect(kept.lines.find((l) => l.key === 'relic')!.points).toBe(RELIC_BONUS)
    expect(kept.lines.find((l) => l.key === 'relic')!.detail).toBe('maintained')

    const lost = buildResults(
      stats({ hadRelic: true, relicKept: false }), { secondsLeft: 0, enemyTotal: 10 })
    expect(lost.lines.find((l) => l.key === 'relic')!.points).toBe(0)
    expect(lost.lines.find((l) => l.key === 'relic')!.detail).toBe('lost')

    const never = buildResults(stats(), { secondsLeft: 0, enemyTotal: 10 })
    expect(never.lines.find((l) => l.key === 'relic')!.detail).toBe('-')
  })

  it('합계는 줄의 합이다', () => {
    const results = buildResults(
      stats({ enemiesKilled: 5, score: 1000, hadRelic: true, relicKept: true }),
      { secondsLeft: 100, enemyTotal: 10 },
    )
    expect(results.total).toBe(results.lines.reduce((s, l) => s + l.points, 0))
  })
})

describe('랭크', () => {
  it('경계에서 갈린다', () => {
    expect(rankFor(RANK_THRESHOLDS.S)).toBe('S')
    expect(rankFor(RANK_THRESHOLDS.S - 1)).toBe('A')
    expect(rankFor(RANK_THRESHOLDS.A)).toBe('A')
    expect(rankFor(RANK_THRESHOLDS.A - 1)).toBe('B')
    expect(rankFor(RANK_THRESHOLDS.B)).toBe('B')
    expect(rankFor(RANK_THRESHOLDS.B - 1)).toBe('C')
    expect(rankFor(0)).toBe('C')
  })

  it('경계가 내림차순이다', () => {
    expect(RANK_THRESHOLDS.S).toBeGreaterThan(RANK_THRESHOLDS.A)
    expect(RANK_THRESHOLDS.A).toBeGreaterThan(RANK_THRESHOLDS.B)
  })
})

describe('점수 롤링', () => {
  const results = buildResults(
    stats({ enemiesKilled: 8, score: 2000, hadRelic: true, relicKept: true }),
    { secondsLeft: 100, enemyTotal: 10 },
  )

  it('총 2.5초다 — docs/09 9.4', () => {
    expect(rollingDurationMs(results)).toBe(4 * LINE_ROLL_MS + TOTAL_ROLL_MS)
    expect(rollingDurationMs(results)).toBe(2500)
  })

  it('시작에는 아무것도 차 있지 않다', () => {
    const roll = rollingAt(results, 0)
    expect(roll.lines.every((l) => l.shown === 0)).toBe(true)
    expect(roll.total).toBe(0)
    expect(roll.rankVisible).toBe(false)
  })

  it('줄이 하나씩 차오른다', () => {
    const roll = rollingAt(results, LINE_ROLL_MS + 1)
    expect(roll.lines[0]!.shown).toBe(results.lines[0]!.points)
    expect(roll.lines[1]!.shown).toBeGreaterThan(0)
    expect(roll.lines[1]!.shown).toBeLessThan(results.lines[1]!.points)
    expect(roll.lines[3]!.shown).toBe(0)
  })

  it('줄이 다 찬 뒤에 합계가 오른다', () => {
    const beforeTotal = rollingAt(results, 4 * LINE_ROLL_MS - 1)
    expect(beforeTotal.total).toBe(0)

    const mid = rollingAt(results, 4 * LINE_ROLL_MS + TOTAL_ROLL_MS / 2)
    expect(mid.total).toBeGreaterThan(0)
    expect(mid.total).toBeLessThan(results.total)
  })

  it('끝나면 전부 채워지고 랭크가 찍힌다 — 아무 키나 누른 것과 같다', () => {
    const roll = rollingAt(results, 999999)
    roll.lines.forEach((l, i) => expect(l.shown).toBe(results.lines[i]!.points))
    expect(roll.total).toBe(results.total)
    expect(roll.rankVisible).toBe(true)
    expect(roll.done).toBe(true)
  })

  it('음수 경과에도 터지지 않는다', () => {
    expect(rollingAt(results, -500).total).toBe(0)
  })
})

describe('시계 표시', () => {
  it('mm:ss 로 적는다', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(600)).toBe('10:00')
    expect(formatClock(-5)).toBe('00:00')
  })
})
