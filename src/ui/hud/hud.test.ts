import { describe, expect, it } from 'vitest'
import { loadBalance } from '../../data/load.ts'
import { createVitals, pickUpRelic } from '../../entities/player/vitals.ts'
import {
  AUTO_DIM,
  DEATH_TIMELINE,
  INITIAL_HUD,
  TIME_WARNING_SECONDS,
  deathToPlayableMs,
  formatScore,
  formatTime,
  isTimeCritical,
  stepHud,
} from './hud.ts'

const balance = loadBalance().player
const vitals = createVitals(balance)

const inputs = (over: Partial<Parameters<typeof stepHud>[1]> = {}) => ({
  vitals, weaponId: 'lance', secondsLeft: 200, score: 0, bossHp: null, busy: false, ...over,
})

describe('상시 요소는 넷뿐이다', () => {
  it('잔기·무기·시간·점수를 따라간다', () => {
    const hud = stepHud(INITIAL_HUD, inputs({ score: 1200, secondsLeft: 120 }), 16)
    expect(hud.lives).toBe(3)
    expect(hud.weaponId).toBe('lance')
    expect(hud.secondsLeft).toBe(120)
    expect(hud.score).toBe(1200)
  })

  it('갑옷 상태는 HUD 에 없다 — 스프라이트가 곧 체력 게이지다', () => {
    const hud = stepHud(INITIAL_HUD, inputs(), 16)
    expect(Object.keys(hud)).not.toContain('armor')
  })
})

describe('조건부 요소', () => {
  it('성흔 쿨다운은 성유물을 입었을 때만 나온다', () => {
    expect(stepHud(INITIAL_HUD, inputs(), 16).sigilCooldown).toBeNull()
    const relic = pickUpRelic(vitals, 'gold', balance)
    expect(stepHud(INITIAL_HUD, inputs({ vitals: relic }), 16).sigilCooldown).not.toBeNull()
  })

  it('보스 HP 는 보스전에서만 나온다', () => {
    expect(stepHud(INITIAL_HUD, inputs(), 16).bossHp).toBeNull()
    expect(stepHud(INITIAL_HUD, inputs({ bossHp: 0.5 }), 16).bossHp).toBe(0.5)
  })
})

describe('시간', () => {
  it('30초 이하에서 경고다', () => {
    expect(TIME_WARNING_SECONDS).toBe(30)
    expect(isTimeCritical({ ...INITIAL_HUD, secondsLeft: 31 })).toBe(false)
    expect(isTimeCritical({ ...INITIAL_HUD, secondsLeft: 30 })).toBe(true)
  })

  it('mm:ss 로 쓴다', () => {
    expect(formatTime(252)).toBe('04:12')
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(-5)).toBe('00:00')
  })

  it('점수에 쉼표를 넣는다', () => {
    expect(formatScore(128400)).toBe('128,400')
    expect(formatScore(0)).toBe('0')
  })
})

describe('자동 흐림', () => {
  it('3초간 조용하면 흐려진다', () => {
    let hud = INITIAL_HUD
    for (let i = 0; i < 400; i += 1) hud = stepHud(hud, inputs(), 16)
    expect(hud.alpha).toBeCloseTo(AUTO_DIM.alpha, 1)
  })

  it('일이 생기면 즉시 밝아진다 — 정보가 필요한 순간에 기다리게 하면 안 된다', () => {
    let hud = INITIAL_HUD
    for (let i = 0; i < 400; i += 1) hud = stepHud(hud, inputs(), 16)
    expect(stepHud(hud, inputs({ busy: true }), 16).alpha).toBe(1)
  })

  it('60% 아래로는 내려가지 않는다 — 안 보이면 HUD 가 아니다', () => {
    let hud = INITIAL_HUD
    for (let i = 0; i < 2000; i += 1) hud = stepHud(hud, inputs(), 16)
    expect(hud.alpha).toBeGreaterThanOrEqual(AUTO_DIM.alpha)
  })
})

describe('사망 → 리스폰 — 3초 예산', () => {
  it('1.85초에 조작 가능해진다', () => {
    expect(deathToPlayableMs()).toBe(1850)
    expect(deathToPlayableMs()).toBeLessThan(3000)
  })

  it('타임라인 순서가 docs/09 와 같다', () => {
    const t = DEATH_TIMELINE
    expect(t.hitstopMs).toBe(250)
    expect(t.skeletonizeAtMs).toBe(250)
    expect(t.fadeOutAtMs).toBe(1250)
    expect(t.moveAtMs).toBe(1550)
    expect(t.playableAtMs).toBe(1850)
    expect(t.moveAtMs).toBe(t.fadeOutAtMs + t.fadeMs)
    expect(t.playableAtMs).toBe(t.moveAtMs + t.fadeMs)
  })

})
