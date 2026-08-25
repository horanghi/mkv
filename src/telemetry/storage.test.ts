import { describe, expect, it } from 'vitest'
import { EMPTY_FRAMES, WARMUP_FRAMES, pushFrame } from './frames.ts'
import {
  NEW_SESSION, SESSION_VERSION, answerSurvey, closePending, noteClear, noteControlBack,
  noteDeath, noteInput, observe, retryRate, withId,
} from './session.ts'
import { STORAGE_KEY, clear, load, parseSession, save, type KeyValueStore } from './storage.ts'

/** 메모리 저장소. 실패를 흉내 낼 수 있다. */
function memoryStore(options: { readonly failWrite?: boolean; readonly failRead?: boolean } = {}): KeyValueStore & {
  readonly data: Map<string, string>
} {
  const data = new Map<string, string>()
  return {
    data,
    getItem(key) {
      if (options.failRead === true) throw new Error('blocked')
      return data.get(key) ?? null
    },
    setItem(key, value) {
      if (options.failWrite === true) throw new Error('quota')
      data.set(key, value)
    },
    removeItem(key) {
      if (options.failWrite === true) throw new Error('blocked')
      data.delete(key)
    },
  }
}

describe('세션 보존', () => {
  it('저장하고 그대로 읽는다', () => {
    const store = memoryStore()
    let session = noteDeath(NEW_SESSION, 1234, 'grimm', 5000)
    session = answerSurvey(noteClear(session, 60000), { deathFxLiked: true, note: '좋다' })
    session = { ...session, frames: pushFrames(3) }

    expect(save(store, session)).toBe(true)
    expect(load(store)).toEqual(session)
  })

  it('기록이 없으면 새 세션이다', () => {
    expect(load(memoryStore())).toEqual(NEW_SESSION)
  })

  it('깨진 JSON 은 새 세션으로 떨어진다', () => {
    const store = memoryStore()
    store.data.set(STORAGE_KEY, '{not json')

    expect(load(store)).toEqual(NEW_SESSION)
  })

  it('버전이 다르면 버린다 — 섞으면 지표가 거짓이 된다', () => {
    const store = memoryStore()
    store.data.set(STORAGE_KEY, JSON.stringify({ ...NEW_SESSION, version: 999, clears: 7 }))

    expect(load(store)).toEqual(NEW_SESSION)
  })

  it('판정 규칙이 바뀐 v1 기록은 버린다 — 같은 자리에 다른 뜻의 숫자가 들어 있다', () => {
    const store = memoryStore()
    store.data.set(STORAGE_KEY, JSON.stringify({
      version: 1, id: 'old', clears: 3,
      deaths: [{ x: 0, cause: 'ghoul', atMs: 0, controlBackMs: 1500, retried: false }],
    }))

    expect(load(store)).toEqual(NEW_SESSION)
  })

  it('저장이 막혀도 게임이 멈추지 않는다', () => {
    expect(save(memoryStore({ failWrite: true }), NEW_SESSION)).toBe(false)
    expect(load(memoryStore({ failRead: true }))).toEqual(NEW_SESSION)
    expect(() => clear(memoryStore({ failWrite: true }))).not.toThrow()
  })

  it('지우면 새 세션으로 돌아간다', () => {
    const store = memoryStore()
    save(store, noteClear(NEW_SESSION, 1000))
    clear(store)

    expect(load(store)).toEqual(NEW_SESSION)
  })
})

describe('낡거나 오염된 기록의 해석', () => {
  it('배열이나 원시값은 새 세션이다', () => {
    expect(parseSession([1, 2, 3])).toEqual(NEW_SESSION)
    expect(parseSession('nope')).toEqual(NEW_SESSION)
    expect(parseSession(null)).toEqual(NEW_SESSION)
  })

  it('빠진 항목은 기본값으로 채운다', () => {
    const parsed = parseSession({ version: SESSION_VERSION })

    expect(parsed).toEqual(NEW_SESSION)
  })

  it('숫자 자리에 문자열이 오면 0 이나 null 로 본다', () => {
    const parsed = parseSession({
      version: SESSION_VERSION,
      playMs: 'lots', clears: null, attemptsToFirstClear: 'many',
      hurts: Number.NaN,
    })

    expect(parsed.playMs).toBe(0)
    expect(parsed.clears).toBe(0)
    expect(parsed.attemptsToFirstClear).toBeNull()
    expect(parsed.hurts).toBe(0)
  })

  it('사망 목록에서 객체가 아닌 항목을 걸러낸다', () => {
    const parsed = parseSession({
      version: SESSION_VERSION,
      deaths: [null, 42, { x: 10, cause: 'pit', atMs: 5, controlBackMs: 9, retried: true }],
    })

    expect(parsed.deaths).toEqual([{ x: 10, cause: 'pit', atMs: 5, controlBackMs: 9, retried: true }])
  })

  it('사망 목록이 배열이 아니면 비운다', () => {
    expect(parseSession({ version: SESSION_VERSION, deaths: 'many' }).deaths).toEqual([])
  })

  it('히스토그램 길이가 달라도 정해진 칸 수로 맞춘다', () => {
    const parsed = parseSession({
      version: SESSION_VERSION,
      frames: { samples: 5, held: 5, discarded: 0, buckets: [1, 2], worstMs: 20 },
    })

    expect(parsed.frames.buckets).toHaveLength(EMPTY_FRAMES.buckets.length)
    expect(parsed.frames.buckets[0]).toBe(1)
    expect(parsed.frames.buckets[2]).toBe(0)
  })

  it('히스토그램이 통째로 없으면 빈 통계다', () => {
    expect(parseSession({ version: SESSION_VERSION, frames: 'gone' }).frames).toEqual(EMPTY_FRAMES)
    expect(parseSession({ version: SESSION_VERSION, frames: { buckets: 'gone' } }).frames)
      .toEqual(EMPTY_FRAMES)
  })

  it('설문이 없거나 형이 틀리면 미응답이다', () => {
    const parsed = parseSession({
      version: SESSION_VERSION,
      survey: { deathFxLiked: 'yes', jumpStiff: false, note: 42 },
    })

    expect(parsed.survey).toEqual({ deathFxLiked: null, jumpStiff: false, note: '' })
  })
})

function pushFrames(count: number): typeof EMPTY_FRAMES {
  let stats = EMPTY_FRAMES
  for (let i = 0; i < WARMUP_FRAMES + count; i += 1) stats = pushFrame(stats, 16)
  return stats
}

describe('탭을 닫았다 열어도 이어진다', () => {
  /** 실제 흐름: 저장 → 새 방문에서 읽기 → 이어서 플레이. */
  it('시도 횟수가 방문을 넘어 이어진다 — 한 번에 끝내지 않는 사람에게도 성립해야 한다', () => {
    const store = memoryStore()

    // 첫 방문 — 세 번 죽고 탭을 닫는다
    let first = withId(NEW_SESSION, 'tester-1')
    for (let i = 0; i < 3; i += 1) {
      const at = i * 20000
      first = noteInput(noteControlBack(noteDeath(first, 100, 'ghoul', at), at + 1500), at + 1700)
    }
    first = closePending(first, 60000)
    expect(save(store, first)).toBe(true)

    // 두 번째 방문 — 읽어서 이어 간다
    let second = load(store)
    expect(second.deaths).toHaveLength(3)
    expect(second.id).toBe('tester-1')
    expect(second.attemptsToFirstClear).toBeNull()

    // 두 번 더 죽고 클리어
    for (let i = 0; i < 2; i += 1) {
      const at = 70000 + i * 20000
      second = noteInput(noteControlBack(noteDeath(second, 100, 'pit', at), at + 1500), at + 1700)
    }
    second = noteClear(second, 120000)

    // 다섯 번 죽고 여섯 번째에 깼다
    expect(second.deaths).toHaveLength(5)
    expect(second.attemptsToFirstClear).toBe(6)
    expect(second.msToFirstClear).toBe(120000)
  })

  it('재시도 판정도 방문을 넘어 보존된다', () => {
    const store = memoryStore()
    let s = withId(NEW_SESSION, 'tester-2')
    s = noteInput(noteControlBack(noteDeath(s, 0, 'ghoul', 0), 1500), 1700)   // 재시도
    s = noteControlBack(noteDeath(s, 0, 'pit', 20000), 21500)
    s = observe(s, 21500 + 4000)                                              // 이탈
    save(store, s)

    const restored = load(store)
    expect(restored.deaths.map((d) => d.retried)).toEqual([true, false])
    expect(retryRate(restored)).toBe(0.5)
  })

  it('한 사람이 두 번 붙여넣어도 같은 식별자로 걸러진다', () => {
    const store = memoryStore()
    save(store, withId(NEW_SESSION, 'tester-3'))

    expect(load(store).id).toBe('tester-3')
    // 새 방문에서 새 식별자를 주려 해도 기존 것이 이긴다
    expect(withId(load(store), 'tester-4').id).toBe('tester-3')
  })
})

describe('난이도 복원', () => {
  it('저장한 난이도를 그대로 읽는다', () => {
    const store = memoryStore()
    save(store, { ...NEW_SESSION, difficulty: 'paladin', id: 'a' })
    expect(load(store).difficulty).toBe('paladin')
  })

  it('난이도가 깨졌으면 기본값으로 떨어진다', () => {
    expect(parseSession({ ...NEW_SESSION, difficulty: 'godmode' }).difficulty)
      .toBe(NEW_SESSION.difficulty)
  })
})
