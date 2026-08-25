import { describe, expect, it } from 'vitest'
import {
  ARMOR_MIX,
  BARE_LOWPASS_HZ,
  BOSS_SILENCE_MS,
  DUCK,
  HURRY_TEMPO,
  INITIAL_MUSIC,
  dbToGain,
  duckMusic,
  gainsOf,
  lowpassFor,
  mixFor,
  shouldPreloadBoss,
  silence,
  stepMusic,
  tempoFor,
} from './audio.ts'

const normal = { armor: 'steel' as const, secondsLeft: 200 }

describe('적응형 믹스 — 곡이 아니라 층이 바뀐다', () => {
  it('성유물은 합창 층이 붙는다', () => {
    expect(ARMOR_MIX.relic.chorus).toBe(1)
    expect(ARMOR_MIX.steel.chorus).toBe(0)
  })

  it('속옷은 합창이 꺼지고 멜로디가 줄어든다', () => {
    expect(ARMOR_MIX.bare.chorus).toBe(0)
    expect(ARMOR_MIX.bare.melody).toBeLessThan(ARMOR_MIX.steel.melody)
  })

  it('속옷에는 저역 통과가 걸린다 — 소리가 멀어진다', () => {
    expect(lowpassFor({ armor: 'bare', secondsLeft: 200 })).toBe(BARE_LOWPASS_HZ)
    expect(lowpassFor(normal)).toBeNull()
  })

  it('리듬과 베이스는 어느 상태에서도 끊기지 않는다 — 이음매가 없어야 한다', () => {
    for (const armor of ['relic', 'steel', 'bare'] as const) {
      expect(ARMOR_MIX[armor].rhythm).toBe(1)
      expect(ARMOR_MIX[armor].bass).toBe(1)
    }
  })

  it('잔여 30초에 타악기가 붙고 템포가 오른다', () => {
    const hurry = { armor: 'steel' as const, secondsLeft: 30 }
    expect(mixFor(hurry).percussion).toBe(1)
    expect(tempoFor(hurry)).toBe(HURRY_TEMPO)
    expect(tempoFor(normal)).toBe(1)
  })
})

describe('더킹', () => {
  it('갑옷 파괴는 -9dB, 사망은 -18dB', () => {
    expect(DUCK.armorBreak.amountDb).toBe(-9)
    expect(DUCK.death.amountDb).toBe(-18)
  })

  it('더 깊은 더킹이 이긴다 — 얕은 것이 깊은 것을 되돌리면 안 된다', () => {
    const deep = duckMusic(INITIAL_MUSIC, DUCK.death)
    expect(duckMusic(deep, DUCK.armorBreak)).toBe(deep)
  })

  it('시간이 지나면 원래대로 돌아온다', () => {
    let state = duckMusic(INITIAL_MUSIC, DUCK.armorBreak)
    expect(state.duck).toBeLessThan(1)
    for (let i = 0; i < 60; i += 1) state = stepMusic(state, normal, 16)
    expect(state.duck).toBe(1)
  })

  it('dB 를 게인으로 바꾼다', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2)
  })
})

describe('보스 등장 무음 — 가장 싸고 강한 효과', () => {
  it('0.3초다', () => {
    expect(BOSS_SILENCE_MS).toBe(300)
  })

  it('무음 중에는 모든 스템이 0 이다', () => {
    const quiet = silence(INITIAL_MUSIC)
    const gains = gainsOf(quiet)
    expect(Object.values(gains).every((g) => g === 0)).toBe(true)
  })

  it('지나면 소리가 돌아온다', () => {
    let state = silence(INITIAL_MUSIC)
    for (let i = 0; i < 30; i += 1) state = stepMusic(state, normal, 16)
    expect(state.silenceMs).toBe(0)
    expect(gainsOf(state).rhythm).toBeGreaterThan(0)
  })
})

describe('프리로드', () => {
  it('보스룸 30초 전에 로드한다 — 문 앞에서 멈추면 순간이 죽는다', () => {
    const gate = 3000
    expect(shouldPreloadBoss(gate - 3400, gate)).toBe(false)
    expect(shouldPreloadBoss(gate - 3200, gate)).toBe(true)
  })
})

describe('게인 계산', () => {
  it('더킹이 모든 스템에 함께 걸린다', () => {
    const ducked = duckMusic({ ...INITIAL_MUSIC, mix: ARMOR_MIX.relic }, DUCK.armorBreak)
    const gains = gainsOf(ducked)
    expect(gains.rhythm).toBeCloseTo(dbToGain(-9))
    expect(gains.chorus).toBeCloseTo(dbToGain(-9))
  })
})
