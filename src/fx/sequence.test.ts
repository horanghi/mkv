import { describe, expect, it } from 'vitest'
import {
  ARMOR_BREAK,
  ARMOR_BREAK_TIMING,
  DEATH,
  DEATH_TIMING,
  IDLE_SEQUENCE,
  advanceSequence,
  progressAt,
  startSequence,
  type ArmorBreakEvent,
  type Timeline,
} from './sequence.ts'

/** 시퀀스를 끝까지 돌리며 발화 순서를 모은다. */
function playAll<T extends string>(timeline: Timeline<T>, dtMs = 1000 / 60): T[] {
  let state = startSequence()
  const fired: T[] = []
  for (let i = 0; i < 500 && !state.done; i += 1) {
    const step = advanceSequence(timeline, state, dtMs)
    state = step.state
    fired.push(...step.fired)
  }
  return fired
}

describe('갑옷 파괴 타임라인 — docs/06 6.3 의 표', () => {
  it('여덟 이벤트가 표 순서대로 발화한다', () => {
    expect(playAll(ARMOR_BREAK)).toEqual([
      'hitstop', 'flash', 'shards', 'ring', 'aberration', 'invert', 'shake', 'resume',
    ])
  })

  it('시각이 문서와 일치한다', () => {
    const at = (event: ArmorBreakEvent) => ARMOR_BREAK.cues.find((c) => c.event === event)?.at
    expect(at('hitstop')).toBe(0)
    expect(at('flash')).toBe(0)
    expect(at('shards')).toBe(40)
    expect(at('ring')).toBe(40)
    expect(at('aberration')).toBe(40)
    expect(at('invert')).toBe(60)
    expect(at('shake')).toBe(100)
    expect(at('resume')).toBe(180)
  })

  it('히트스톱이 끝나는 시각과 resume 이 같다', () => {
    const resume = ARMOR_BREAK.cues.find((c) => c.event === 'resume')?.at
    expect(resume).toBe(ARMOR_BREAK_TIMING.hitstopMs)
  })

  it('큐가 시각 순으로 정렬돼 있다', () => {
    const times = ARMOR_BREAK.cues.map((c) => c.at)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('파편은 24개, 3초 유지다', () => {
    expect(ARMOR_BREAK_TIMING.shardCount).toBe(24)
    expect(ARMOR_BREAK_TIMING.shardHoldMs).toBe(3000)
  })
})

describe('발화', () => {
  it('시각이 되기 전에는 발화하지 않는다', () => {
    const step = advanceSequence(ARMOR_BREAK, startSequence(), 10)
    expect(step.fired).toEqual(['hitstop', 'flash'])
  })

  it('한 번에 여러 큐를 지나가도 전부 순서대로 발화한다', () => {
    // 프레임이 밀렸다고 섬광이 빠지면 연출이 무너진다.
    const step = advanceSequence(ARMOR_BREAK, startSequence(), 200)
    expect(step.fired).toEqual([
      'hitstop', 'flash', 'shards', 'ring', 'aberration', 'invert', 'shake', 'resume',
    ])
  })

  it('같은 이벤트를 두 번 발화하지 않는다', () => {
    const all = playAll(ARMOR_BREAK)
    expect(new Set(all).size).toBe(all.length)
  })

  it('끝난 시퀀스는 더 진행하지 않는다', () => {
    let state = startSequence()
    for (let i = 0; i < 400; i += 1) state = advanceSequence(ARMOR_BREAK, state, 16).state
    expect(state.done).toBe(true)
    const after = advanceSequence(ARMOR_BREAK, state, 16)
    expect(after.state).toBe(state)
    expect(after.fired).toEqual([])
  })

  it('대기 상태는 아무 일도 하지 않는다', () => {
    expect(advanceSequence(ARMOR_BREAK, IDLE_SEQUENCE, 100).fired).toEqual([])
  })

  it('음수 시간은 무시한다', () => {
    const step = advanceSequence(ARMOR_BREAK, startSequence(), -50)
    expect(step.state.elapsedMs).toBe(0)
  })
})

describe('진행도', () => {
  it('구간 안에서 0에서 1로 간다', () => {
    const at = (ms: number) => progressAt({ elapsedMs: ms, fired: 0, done: false }, 40, 140)
    expect(at(40)).toBe(0)
    expect(at(110)).toBeCloseTo(0.5)
    expect(at(180)).toBe(1)
  })

  it('구간 밖은 0과 1로 잘린다', () => {
    const at = (ms: number) => progressAt({ elapsedMs: ms, fired: 0, done: false }, 40, 140)
    expect(at(0)).toBe(0)
    expect(at(5000)).toBe(1)
  })

  it('길이가 0이면 즉시 1이다', () => {
    expect(progressAt(startSequence(), 0, 0)).toBe(1)
  })
})

describe('사망 타임라인 — 3초 예산', () => {
  it('여섯 이벤트가 순서대로 발화한다', () => {
    expect(playAll(DEATH)).toEqual([
      'hitstop', 'skeletonize', 'shatter', 'slowmo', 'fade', 'respawn',
    ])
  })

  it('총 1.25초다 — docs/06 6.3', () => {
    expect(DEATH.durationMs).toBe(1250)
  })

  it('리스폰까지 합쳐 3초 예산 안에 든다', () => {
    // 사망 연출 1.25초 + 리스폰 여유. docs/02 2.6 재시작 3초 규칙.
    expect(DEATH.durationMs + 1500).toBeLessThanOrEqual(3000)
  })

  it('백골화가 8프레임이다', () => {
    expect(DEATH_TIMING.skeletonizeFrames).toBe(8)
    expect(DEATH_TIMING.hitstopMs).toBe(250)
    expect(DEATH_TIMING.slowmo.scale).toBeCloseTo(0.3)
  })
})
