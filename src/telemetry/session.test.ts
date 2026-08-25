import { describe, expect, it } from 'vitest'
import { EMPTY_FRAMES } from './frames.ts'
import {
  NEW_SESSION, RETRY_WINDOW_MS,
  answerSurvey, closePending, noteArmorBreak, noteBossReached, noteClear,
  noteControlBack, noteDeath, noteFrame, noteHurt, noteInput, observe, withDifficulty,
  retryRate, withId, worstControlBackMs, type Session,
} from './session.ts'

/** 죽고 → 1.5초 뒤 조작 복귀. 실제 흐름과 같은 순서다. */
function died(session: Session, atMs: number, x = 100): Session {
  return noteControlBack(noteDeath(session, x, 'ghoul', atMs), atMs + 1500)
}

describe('세션 계측 — 재시도율', () => {
  it('조작이 돌아오고 바로 누르면 재시도다', () => {
    let s = died(NEW_SESSION, 1000)
    s = noteInput(s, 2600) // 복귀 2500ms + 100ms

    expect(s.deaths[0]?.retried).toBe(true)
    expect(retryRate(s)).toBe(1)
  })

  it('창을 넘겨 누르면 이탈이다', () => {
    let s = died(NEW_SESSION, 1000)
    s = noteInput(s, 2500 + RETRY_WINDOW_MS + 1)

    expect(s.deaths[0]?.retried).toBe(false)
    expect(retryRate(s)).toBe(0)
  })

  it('입력이 아예 없으면 시간만으로 이탈이 확정된다', () => {
    let s = died(NEW_SESSION, 1000)
    expect(s.deaths[0]?.retried).toBeNull()

    s = observe(s, 2500 + RETRY_WINDOW_MS - 1)
    expect(s.deaths[0]?.retried).toBeNull()

    s = observe(s, 2500 + RETRY_WINDOW_MS + 1)
    expect(s.deaths[0]?.retried).toBe(false)
  })

  it('한 번 정해진 판정은 나중 입력이 뒤집지 못한다', () => {
    let s = died(NEW_SESSION, 1000)
    s = noteInput(s, 2600)
    s = noteInput(s, 60000)

    expect(s.deaths[0]?.retried).toBe(true)
  })

  it('조작이 돌아오기 전의 입력은 재시도로 세지 않는다 — 연출 중 연타다', () => {
    let s = noteDeath(NEW_SESSION, 100, 'pit', 1000)
    s = noteInput(s, 1100)

    expect(s.deaths[0]?.retried).toBeNull()
  })

  it('판정이 안 끝난 사망은 분모에 넣지 않는다', () => {
    let s = died(NEW_SESSION, 1000)
    s = noteInput(s, 2600)
    s = died(s, 20000) // 판정 전

    expect(s.deaths).toHaveLength(2)
    expect(retryRate(s)).toBe(1)
  })

  it('다시 죽으면 직전 사망은 재시도로 확정된다 — 죽으려면 계속해야 한다', () => {
    // 부활하자마자 다시 죽는 경우. 한 프레임에 부활 틱과 사망 틱이 같이 들어오면
    // 조작 복귀가 관측되지 않는데, 그렇다고 이탈은 아니다.
    let s = noteDeath(NEW_SESSION, 100, 'ghoul', 1000)
    expect(s.deaths[0]?.retried).toBeNull()

    s = noteDeath(s, 120, 'ghoul', 2600)
    expect(s.deaths[0]?.retried).toBe(true)
    expect(s.deaths[1]?.retried).toBeNull()
  })

  it('이미 이탈로 닫힌 사망은 다시 죽어도 되살아나지 않는다', () => {
    let s = died(NEW_SESSION, 1000)
    s = observe(s, 2500 + RETRY_WINDOW_MS + 1)   // 창을 넘겨 이탈 확정
    expect(s.deaths[0]?.retried).toBe(false)

    s = noteDeath(s, 100, 'pit', 60000)
    expect(s.deaths[0]?.retried).toBe(false)
  })

  it('9번 재시도하고 1번 이탈하면 90% 다', () => {
    let s: Session = NEW_SESSION
    for (let i = 0; i < 9; i += 1) {
      s = died(s, i * 10000)
      s = noteInput(s, i * 10000 + 1600)
    }
    s = died(s, 90000)
    s = observe(s, 90000 + 1500 + RETRY_WINDOW_MS + 1)

    expect(retryRate(s)).toBeCloseTo(0.9, 5)
  })

  it('세션을 닫으면 남은 판정은 이탈이다 — 그대로 나갔다는 뜻이다', () => {
    let s = noteDeath(NEW_SESSION, 100, 'cairn', 1000)
    s = closePending(s, 1200)

    expect(s.deaths[0]?.retried).toBe(false)
  })

  it('닫을 때 창 안이면 재시도로 인정한다', () => {
    let s = died(NEW_SESSION, 1000)
    s = closePending(s, 2600)

    expect(s.deaths[0]?.retried).toBe(true)
  })

  it('사망이 없으면 재시도율은 0 이다', () => {
    expect(retryRate(NEW_SESSION)).toBe(0)
    expect(observe(NEW_SESSION, 5000)).toBe(NEW_SESSION)
    expect(closePending(NEW_SESSION, 5000)).toBe(NEW_SESSION)
    expect(noteInput(NEW_SESSION, 5000)).toBe(NEW_SESSION)
  })
})

describe('세션 계측 — 시도 횟수와 사인', () => {
  it('첫 클리어까지의 시도 횟수는 사망 + 1 이다', () => {
    let s: Session = NEW_SESSION
    for (let i = 0; i < 10; i += 1) s = died(s, i * 5000)
    s = noteClear(s, 60000)

    expect(s.attemptsToFirstClear).toBe(11)
    expect(s.msToFirstClear).toBe(60000)
  })

  it('두 번째 클리어는 시도 횟수를 덮어쓰지 않는다', () => {
    let s = noteClear(NEW_SESSION, 60000)
    s = died(s, 70000)
    s = noteClear(s, 90000)

    expect(s.clears).toBe(2)
    expect(s.attemptsToFirstClear).toBe(1)
    expect(s.msToFirstClear).toBe(60000)
  })

  it('사인과 위치를 남긴다', () => {
    const s = noteDeath(NEW_SESSION, 1234, 'grimm', 8000)

    expect(s.deaths[0]).toMatchObject({ x: 1234, cause: 'grimm', atMs: 8000 })
  })

  it('사망 → 조작 복귀 시간의 최댓값을 잡는다', () => {
    let s = noteControlBack(noteDeath(NEW_SESSION, 0, 'pit', 1000), 2500)
    s = noteInput(s, 2600)
    s = noteControlBack(noteDeath(s, 0, 'pit', 10000), 12000)

    expect(worstControlBackMs(s)).toBe(2000)
  })

  it('복귀 기록이 없으면 0 이다', () => {
    expect(worstControlBackMs(noteDeath(NEW_SESSION, 0, 'pit', 1000))).toBe(0)
  })

  it('조작 복귀는 한 번만 기록된다 — 매 프레임 불러도 첫 값이 남는다', () => {
    let s = noteDeath(NEW_SESSION, 0, 'pit', 1000)
    s = noteControlBack(s, 2500)
    s = noteControlBack(s, 9000)

    expect(s.deaths[0]?.controlBackMs).toBe(2500)
  })
})

describe('세션 계측 — 나머지 항목', () => {
  it('피격·갑옷 파괴·보스 도달을 센다', () => {
    let s = noteHurt(noteHurt(NEW_SESSION))
    s = noteArmorBreak(s)
    s = noteBossReached(s)
    const same = noteBossReached(s)

    expect(s.hurts).toBe(2)
    expect(s.armorBreaks).toBe(1)
    expect(s.bossReached).toBe(true)
    expect(same).toBe(s)
  })

  it('설문은 부분 갱신된다', () => {
    let s = answerSurvey(NEW_SESSION, { deathFxLiked: true })
    s = answerSurvey(s, { note: '보스가 어렵다' })

    expect(s.survey).toEqual({ deathFxLiked: true, jumpStiff: null, note: '보스가 어렵다' })
  })

  it('프레임 통계와 플레이 시간을 함께 갱신한다', () => {
    const s = noteFrame(NEW_SESSION, EMPTY_FRAMES, 12345)
    expect(s.playMs).toBe(12345)
  })

  it('원본을 바꾸지 않는다', () => {
    const before = died(NEW_SESSION, 1000)
    noteInput(before, 2600)
    noteClear(before, 3000)

    expect(before.deaths[0]?.retried).toBeNull()
    expect(before.clears).toBe(0)
    expect(NEW_SESSION.deaths).toHaveLength(0)
  })
})

describe('난이도가 바뀔 때', () => {
  it('같은 난이도면 세션을 그대로 둔다', () => {
    const started = withId(NEW_SESSION, 'a')
    const dead = noteDeath(started, 100, 'pit', 0)
    expect(withDifficulty(dead, dead.difficulty, 'b')).toBe(dead)
  })

  it('다른 난이도면 기록을 버리고 새로 연다 — 섞으면 읽을 수 없다', () => {
    const dead = noteDeath(withId(NEW_SESSION, 'a'), 100, 'pit', 0)
    const next = withDifficulty(dead, 'paladin', 'b')

    expect(next.difficulty).toBe('paladin')
    expect(next.id).toBe('b')
    expect(next.deaths).toEqual([])
    expect(next.playMs).toBe(0)
    expect(next.attemptsToFirstClear).toBeNull()
  })

  it('원래 세션을 건드리지 않는다', () => {
    const dead = noteDeath(withId(NEW_SESSION, 'a'), 100, 'pit', 0)
    withDifficulty(dead, 'squire', 'b')
    expect(dead.deaths).toHaveLength(1)
    expect(dead.id).toBe('a')
  })
})
