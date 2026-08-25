import { describe, expect, it } from 'vitest'
import type { DamageCause } from '../game/world.ts'
import { EMPTY_FRAMES, WARMUP_FRAMES, pushFrame } from './frames.ts'
import { NOTE_LIMIT, toJson, toPayload } from './payload.ts'
import {
  NEW_SESSION, answerSurvey, noteClear, noteControlBack, noteDeath, noteInput,
  withId, type Session,
} from './session.ts'


function played(): Session {
  let s = withId(NEW_SESSION, 'abc12345')
  for (let i = 0; i < 6; i += 1) {
    const at = i * 20000
    s = noteControlBack(noteDeath(s, 1300, i === 0 ? 'pit' : 'grimm', at), at + 1500)
    s = noteInput(s, at + 1700)
  }
  s = noteClear(s, 200000)
  s = answerSurvey(s, { deathFxLiked: true, jumpStiff: false, note: '보스가 어렵다' })

  let frames = EMPTY_FRAMES
  for (let i = 0; i < WARMUP_FRAMES + 1000; i += 1) frames = pushFrame(frames, 16)
  return { ...s, frames, playMs: 210000, hurts: 12, armorBreaks: 4, bossReached: true }
}

describe('결과 꾸러미', () => {
  it('게이트가 묻는 것을 전부 담는다', () => {
    const payload = toPayload(played(), 168_000)

    expect(payload.id).toBe('abc12345')
    expect(payload.retryRate).toBe(1)
    expect(payload.attempts).toBe(7)
    expect(payload.cleared).toBe(true)
    expect(payload.fps.held).toBe(1)
    expect(payload.loadKB).toBe(164)
    expect(payload.worstRespawnMs).toBe(1500)
    expect(payload.survey.deathFxLiked).toBe(true)
  })

  it('사인과 사망 구간을 담는다', () => {
    const payload = toPayload(played(), null)

    expect(payload.causes).toEqual({ grimm: 5, pit: 1 })
    expect(payload.hotspots).toEqual([[80, 6]])
  })

  it('표본이 없으면 null 이다 — 0 이라고 하면 계측한 것처럼 보인다', () => {
    const payload = toPayload(NEW_SESSION, null)

    expect(payload.retryRate).toBeNull()
    expect(payload.fps.held).toBeNull()
    expect(payload.loadKB).toBeNull()
    expect(payload.attempts).toBeNull()
    expect(payload.cleared).toBe(false)
  })

  it('긴 메모는 잘라 낸다', () => {
    const long = answerSurvey(NEW_SESSION, { note: 'ㄱ'.repeat(NOTE_LIMIT + 200) })

    expect(toPayload(long, null).survey.note).toHaveLength(NOTE_LIMIT)
  })

  it('소수를 적당히 자른다 — 붙여넣기 가능한 길이여야 한다', () => {
    const json = toJson(played(), 168_000)

    expect(json).not.toContain('0000000')
    expect(json.length).toBeLessThan(700)
    expect(JSON.parse(json)).toEqual(toPayload(played(), 168_000))
  })
})

describe('세션 식별자', () => {
  it('한 번 붙으면 바뀌지 않는다', () => {
    const first = withId(NEW_SESSION, 'aaa')
    expect(withId(first, 'bbb').id).toBe('aaa')
  })
})

const CAUSES: readonly DamageCause[] = ['ghoul', 'grimm', 'corvid', 'cairn', 'pit']

describe('붙여넣기 가능한 크기', () => {
  it('많이 죽어도 메신저에 붙일 만하다', () => {
    // 지독하게 오래 붙든 테스터: 스테이지 전역에서 50번 사망 + 최대 길이 메모
    let s = withId(NEW_SESSION, 'abc12345')
    for (let i = 0; i < 50; i += 1) {
      const at = i * 20000
      // 164타일 스테이지 전역에 흩뿌린다 → 사망 구간이 최대로 쪼개진다
      const x = (i * 53) % (164 * 16)
      const cause = CAUSES[i % CAUSES.length] ?? 'pit'
      s = noteInput(noteControlBack(noteDeath(s, x, cause, at), at + 1500), at + 1700)
    }
    s = answerSurvey(noteClear(s, 1_200_000), {
      deathFxLiked: true, jumpStiff: false, note: 'ㄱ'.repeat(NOTE_LIMIT),
    })

    const json = toJson(s, 180_000)
    const payload = toPayload(s, 180_000)

    // 메모를 뺀 본체가 2KB 를 넘으면 붙여넣기가 불안해진다
    expect(json.length - payload.survey.note.length).toBeLessThan(2000)
    expect(payload.deaths).toBe(50)
    expect(JSON.parse(json).hotspots.length).toBeGreaterThan(5)
  })

  it('사망 구간이 스테이지 폭을 넘어 늘어나지 않는다', () => {
    const STAGE_PX = 164 * 16
    let s = NEW_SESSION
    // 스테이지 안 어디에서든 죽어도, 구간 수는 폭으로 묶인다.
    for (let i = 0; i < 400; i += 1) s = noteDeath(s, (i * 7) % STAGE_PX, 'pit', i * 1000)

    // 8타일(128px) 단위 → ceil(2624 / 128) = 21 구간
    expect(toPayload(s, null).hotspots.length).toBeLessThanOrEqual(21)
  })
})
