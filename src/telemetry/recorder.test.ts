import { describe, expect, it } from 'vitest'
import { RETRY_WINDOW_MS, retryRate } from './session.ts'
import { NEW_RECORDER, record, resume, type Observation, type RecorderState } from './recorder.ts'
import { NEW_SESSION, noteClear } from './session.ts'

const QUIET: Observation = {
  nowMs: 0, frameMs: 16, dead: false, playerX: 100, cleared: false,
  bossAwake: false, pressed: false, respawned: false, died: false, hurt: false,
  armorBroke: false, cause: null,
}

function at(nowMs: number, patch: Partial<Observation> = {}): Observation {
  return { ...QUIET, nowMs, ...patch }
}

/** 죽고 → 90틱 뒤 부활하는 실제 흐름. */
function deathCycle(state: RecorderState, start: number, retryAfterMs: number | null): RecorderState {
  let s = record(state, at(start, { died: true, dead: true, cause: 'ghoul', playerX: 800 }))
  // 연출 동안 죽어 있다
  for (let t = start + 16; t < start + 1500; t += 16) s = record(s, at(t, { dead: true }))
  // 부활 — 이 프레임에 dead 가 풀린다
  s = record(s, at(start + 1500))
  if (retryAfterMs !== null) s = record(s, at(start + 1500 + retryAfterMs, { pressed: true }))
  return s
}

describe('계측 기록기', () => {
  it('죽으면 사인과 위치를 남긴다', () => {
    const s = record(NEW_RECORDER, at(5000, { died: true, dead: true, cause: 'pit', playerX: 640 }))

    expect(s.session.deaths).toHaveLength(1)
    expect(s.session.deaths[0]).toMatchObject({ x: 640, cause: 'pit', atMs: 5000 })
  })

  it('죽었다 살아난 프레임에 조작 복귀를 찍는다', () => {
    const s = deathCycle(NEW_RECORDER, 1000, null)

    expect(s.session.deaths[0]?.controlBackMs).toBe(2500)
    expect(s.wasDead).toBe(false)
  })

  it('복귀 직후 입력이면 재시도다', () => {
    const s = deathCycle(NEW_RECORDER, 1000, 200)

    expect(s.session.deaths[0]?.retried).toBe(true)
    expect(retryRate(s.session)).toBe(1)
  })

  it('부활 프레임에 이미 눌려 있어도 재시도로 잡힌다', () => {
    // 복귀 판정이 입력 판정보다 먼저 와야 한다. 순서가 뒤집히면 여기서 깨진다.
    let s = record(NEW_RECORDER, at(1000, { died: true, dead: true, cause: 'ghoul' }))
    s = record(s, at(2500, { pressed: true }))

    expect(s.session.deaths[0]?.retried).toBe(true)
  })

  it('창을 넘겨 아무것도 안 하면 이탈이다', () => {
    let s = deathCycle(NEW_RECORDER, 1000, null)
    s = record(s, at(2500 + RETRY_WINDOW_MS + 100))

    expect(s.session.deaths[0]?.retried).toBe(false)
    expect(retryRate(s.session)).toBe(0)
  })

  it('클리어는 한 번만 센다', () => {
    let s = record(NEW_RECORDER, at(60000, { cleared: true }))
    s = record(s, at(60016, { cleared: true }))
    s = record(s, at(60032, { cleared: true }))

    expect(s.session.clears).toBe(1)
    expect(s.session.attemptsToFirstClear).toBe(1)
  })

  it('피격·갑옷 파괴·보스 도달을 옮긴다', () => {
    let s = record(NEW_RECORDER, at(1000, { hurt: true, armorBroke: true, cause: 'grimm' }))
    s = record(s, at(2000, { hurt: true, cause: 'corvid' }))
    s = record(s, at(3000, { bossAwake: true }))
    s = record(s, at(3016, { bossAwake: true }))

    expect(s.session.hurts).toBe(2)
    expect(s.session.armorBreaks).toBe(1)
    expect(s.session.bossReached).toBe(true)
  })

  it('프레임 타임을 계속 모은다', () => {
    let s: RecorderState = NEW_RECORDER
    for (let i = 0; i < 200; i += 1) s = record(s, at(i * 16, { frameMs: 16 }))

    expect(s.session.frames.samples).toBeGreaterThan(100)
    expect(s.session.playMs).toBe(199 * 16)
  })

  it('이전 세션에서 이어 받는다 — 탭을 닫았다 열어도 시도가 이어진다', () => {
    const s = resume(noteClear(NEW_SESSION, 1000))

    expect(s.session.clears).toBe(1)
    expect(s.wasDead).toBe(false)
  })

  it('원본 상태를 바꾸지 않는다', () => {
    const before = NEW_RECORDER
    record(before, at(1000, { died: true, dead: true, cause: 'pit' }))

    expect(before.session.deaths).toHaveLength(0)
    expect(before.wasDead).toBe(false)
  })
})

describe('한 프레임에 부활과 사망이 같이 들어올 때', () => {
  it('부활을 틱 단위로 보고하면 조작 복귀가 기록된다', () => {
    // 프레임 앞뒤만 비교하면 dead 가 true → true 라 복귀가 안 보인다.
    let s = record(NEW_RECORDER, at(1000, { died: true, dead: true, cause: 'ghoul' }))
    s = record(s, at(2500, { respawned: true, dead: true, died: true, cause: 'ghoul' }))

    // 첫 사망은 조작이 돌아온 것이 기록되고, 재시도로 확정된다
    expect(s.session.deaths[0]?.controlBackMs).toBe(2500)
    expect(s.session.deaths[0]?.retried).toBe(true)
    expect(s.session.deaths).toHaveLength(2)
  })

  it('부활 보고가 없어도 프레임 전이로 잡는다 — 둘 중 하나면 된다', () => {
    let s = record(NEW_RECORDER, at(1000, { died: true, dead: true, cause: 'pit' }))
    s = record(s, at(2500))

    expect(s.session.deaths[0]?.controlBackMs).toBe(2500)
  })
})
