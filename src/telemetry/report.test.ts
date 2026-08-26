import { describe, expect, it } from 'vitest'
import { DEFAULT_DIFFICULTY, DIFFICULTIES, rulesFor } from '../game/difficulty.ts'
import { EMPTY_FRAMES, WARMUP_FRAMES, pushFrame, type FrameStats } from './frames.ts'
import {
  GATE, MIN_DEATHS, MIN_FRAMES,
  buildReport, causeBreakdown, deathHotspots, formatBytes, overallVerdict,
  type Metric, type Verdict,
} from './report.ts'
import {
  NEW_SESSION, answerSurvey, noteClear, noteControlBack, noteDeath, noteInput,
  type Session,
} from './session.ts'

function frames(total: number, slow: number): FrameStats {
  let stats = EMPTY_FRAMES
  for (let i = 0; i < WARMUP_FRAMES; i += 1) stats = pushFrame(stats, 16)
  for (let i = 0; i < total - slow; i += 1) stats = pushFrame(stats, 16)
  for (let i = 0; i < slow; i += 1) stats = pushFrame(stats, 33)
  return stats
}

/** 재시도까지 마친 사망 n 번. */
function deaths(session: Session, count: number, retried: boolean): Session {
  let s = session
  for (let i = 0; i < count; i += 1) {
    const at = i * 20000
    s = noteControlBack(noteDeath(s, 100 + i, 'ghoul', at), at + 1500)
    s = noteInput(s, at + (retried ? 1600 : 9000))
  }
  return s
}

function verdictOf(metrics: readonly Metric[], key: string): Verdict {
  const found = metrics.find((m) => m.key === key)
  if (found === undefined) throw new Error(`no metric ${key}`)
  return found.verdict
}

describe('게이트 판정', () => {
  it('표본이 모자라면 unknown 이다 — 통과로 읽히면 안 된다', () => {
    const metrics = buildReport({ session: NEW_SESSION, loadBytes: null })

    expect(metrics.every((m) => m.verdict === 'unknown')).toBe(true)
    expect(overallVerdict(metrics)).toBe('unknown')
  })

  it('사망이 최소 수에 못 미치면 재시도율을 판정하지 않는다', () => {
    const few = deaths(NEW_SESSION, MIN_DEATHS - 1, true)
    expect(verdictOf(buildReport({ session: few, loadBytes: null }), 'retryRate')).toBe('unknown')

    const enough = deaths(NEW_SESSION, MIN_DEATHS, true)
    expect(verdictOf(buildReport({ session: enough, loadBytes: null }), 'retryRate')).toBe('pass')
  })

  it('재시도율 합격선은 90% 다', () => {
    // 10번 중 9번 재시도 = 90% → 통과
    let s = deaths(NEW_SESSION, 9, true)
    s = deaths(s, 1, false)
    expect(verdictOf(buildReport({ session: s, loadBytes: null }), 'retryRate')).toBe('pass')

    // 10번 중 8번 = 80% → 실패
    let t = deaths(NEW_SESSION, 8, true)
    t = deaths(t, 2, false)
    expect(verdictOf(buildReport({ session: t, loadBytes: null }), 'retryRate')).toBe('fail')
  })

  it('프레임 표본이 모자라면 fps 를 판정하지 않는다', () => {
    const short = { ...NEW_SESSION, frames: frames(MIN_FRAMES - 1, 0) }
    expect(verdictOf(buildReport({ session: short, loadBytes: null }), 'fps')).toBe('unknown')
  })

  it('60fps 유지율 95% 를 가른다', () => {
    const ok = { ...NEW_SESSION, frames: frames(MIN_FRAMES, MIN_FRAMES * 0.05) }
    expect(verdictOf(buildReport({ session: ok, loadBytes: null }), 'fps')).toBe('pass')

    const bad = { ...NEW_SESSION, frames: frames(MIN_FRAMES, MIN_FRAMES * 0.06) }
    expect(verdictOf(buildReport({ session: bad, loadBytes: null }), 'fps')).toBe('fail')
  })

  it('시도 횟수는 8~15 회 안이어야 한다', () => {
    const inRange = noteClear(deaths(NEW_SESSION, 9, true), 100000)
    expect(verdictOf(buildReport({ session: inRange, loadBytes: null }), 'attempts')).toBe('pass')

    const tooEasy = noteClear(deaths(NEW_SESSION, GATE.attempts.min - 2, true), 100000)
    expect(verdictOf(buildReport({ session: tooEasy, loadBytes: null }), 'attempts')).toBe('fail')

    const tooHard = noteClear(deaths(NEW_SESSION, GATE.attempts.max, true), 100000)
    expect(verdictOf(buildReport({ session: tooHard, loadBytes: null }), 'attempts')).toBe('fail')
  })

  it('미클리어는 unknown 이고, 현재 몇 회째인지 보여준다', () => {
    const s = deaths(NEW_SESSION, 3, true)
    const metric = buildReport({ session: s, loadBytes: null }).find((m) => m.key === 'attempts')

    expect(metric?.verdict).toBe('unknown')
    expect(metric?.value).toContain('4회째')
  })

  it('연출 설문에 답하면 판정이 선다', () => {
    const liked = answerSurvey(NEW_SESSION, { deathFxLiked: true })
    expect(verdictOf(buildReport({ session: liked, loadBytes: null }), 'deathFx')).toBe('pass')

    const disliked = answerSurvey(NEW_SESSION, { deathFxLiked: false })
    expect(verdictOf(buildReport({ session: disliked, loadBytes: null }), 'deathFx')).toBe('fail')
  })

  it('초기 로드 8MB 를 가른다', () => {
    expect(verdictOf(buildReport({ session: NEW_SESSION, loadBytes: GATE.loadBytes }), 'load')).toBe('pass')
    expect(verdictOf(buildReport({ session: NEW_SESSION, loadBytes: GATE.loadBytes + 1 }), 'load')).toBe('fail')
  })

  it('사망 → 조작 3초를 가른다', () => {
    const fast = noteControlBack(noteDeath(NEW_SESSION, 0, 'pit', 0), 1850)
    expect(verdictOf(buildReport({ session: fast, loadBytes: null }), 'controlBack')).toBe('pass')

    const slow = noteControlBack(noteDeath(NEW_SESSION, 0, 'pit', 0), GATE.controlBackMs + 1)
    expect(verdictOf(buildReport({ session: slow, loadBytes: null }), 'controlBack')).toBe('fail')
  })

  it('하나라도 실패하면 전체는 실패다', () => {
    let s = deaths(NEW_SESSION, 10, false)
    s = answerSurvey(noteClear(s, 100000), { deathFxLiked: true })
    s = { ...s, frames: frames(MIN_FRAMES, 0) }

    const metrics = buildReport({ session: s, loadBytes: 1000 })
    expect(overallVerdict(metrics)).toBe('fail')
  })

  it('전부 채우면 통과한다', () => {
    let s = deaths(NEW_SESSION, 10, true)
    s = answerSurvey(noteClear(s, 100000), { deathFxLiked: true })
    s = { ...s, frames: frames(MIN_FRAMES, 0) }

    expect(overallVerdict(buildReport({ session: s, loadBytes: 1000 }))).toBe('pass')
  })
})

describe('사망 진단', () => {
  it('구간별로 묶는다 — 어디서 반복해 죽는지 보인다', () => {
    let s = NEW_SESSION
    for (let i = 0; i < 5; i += 1) s = noteDeath(s, 1300 + i, 'grimm', i * 1000)
    s = noteDeath(s, 200, 'pit', 9000)

    const spots = deathHotspots(s)
    expect(spots[0]).toEqual({ tx: 80, deaths: 5 })
    expect(spots[1]).toEqual({ tx: 8, deaths: 1 })
  })

  it('사망이 없으면 빈 목록이다', () => {
    expect(deathHotspots(NEW_SESSION)).toEqual([])
    expect(causeBreakdown(NEW_SESSION)).toEqual([])
  })

  it('사인을 많은 순으로 센다', () => {
    let s = noteDeath(NEW_SESSION, 0, 'pit', 0)
    s = noteDeath(s, 0, 'grimm', 1000)
    s = noteDeath(s, 0, 'grimm', 2000)
    s = noteDeath(s, 0, null, 3000)

    expect(causeBreakdown(s)).toEqual([['grimm', 2], ['pit', 1], ['unknown', 1]])
  })
})

describe('표시', () => {
  it('바이트를 사람이 읽는 단위로 바꾼다', () => {
    expect(formatBytes(512)).toBe('512B')
    expect(formatBytes(2048)).toBe('2.0KB')
    expect(formatBytes(8 * 1024 * 1024)).toBe('8.00MB')
  })
})

describe('설문 노출 문턱과 잔기의 관계', () => {
  /**
   * 실제로 밟아 보고 알았다 — **게임 오버가 설문 버튼보다 먼저 온다.**
   *
   * 게이트 난이도(기사)는 잔기가 3이라 네 번째 사망에서 GAME OVER 가 뜨는데,
   * "결과 보내기" 는 다섯 번째 사망에야 나온다. 테스터가 가장 그만두기 쉬운
   * 자리에서 결과를 보낼 방법이 없다는 뜻이고, 그러면 표본이 0이 된다.
   *
   * 그래서 `main.ts` 가 게임 오버에서도 버튼을 드러낸다. 이 테스트는 그
   * 배선이 **왜 필요한지**를 붙잡아 둔다 — 잔기나 MIN_DEATHS 가 바뀌어
   * 관계가 뒤집히면 여기서 걸리고, 그때 배선을 다시 판단하면 된다.
   */
  it('게임 오버가 설문 노출보다 먼저 온다 — 그래서 거기서도 열어야 한다', () => {
    const lives = rulesFor(DEFAULT_DIFFICULTY).lives
    expect(lives).toBeLessThan(MIN_DEATHS)
  })

  it('어느 난이도가 그 배선에 기대고 있는지 적어 둔다', () => {
    // 잔기가 MIN_DEATHS 보다 적은 난이도에서만 게임 오버가 먼저 온다.
    // 종자(잔기 5)는 다섯 번째 사망에서 버튼이 먼저 나오므로 해당 없다.
    const dependsOnGameOver = DIFFICULTIES.filter((id) => rulesFor(id).lives < MIN_DEATHS)

    expect(dependsOnGameOver).toEqual(['knight', 'paladin'])
  })
})
