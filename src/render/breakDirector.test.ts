import { describe, expect, it } from 'vitest'
import { DEATH_TIMING } from '../fx/sequence.ts'
import { BreakDirector } from './breakDirector.ts'

/**
 * 사망 연출의 두 배율 — 시간과 채도.
 *
 * `render/` 는 커버리지 대상이 아니지만 이 둘은 순수 함수이고 **docs/06 의
 * 표를 그대로 담고 있다.** 이 프로젝트가 반복해서 밟은 결함이 "정의는 있는데
 * 아무도 읽지 않는다" 였으므로, 값이 조용히 죽지 않게 여기서 잡는다.
 */

/** 사망 후 `ms` 만큼 흘린 감독. 연출은 실제 프레임 시간으로 돈다. */
function afterDeath(ms: number): BreakDirector {
  const director = new BreakDirector(1)
  director.die({ matrix: ['99', '99'], origin: { x: 0, y: 0 } })
  for (let left = ms; left > 0; left -= 10) director.advance(10)
  return director
}

describe('사망 슬로우모션', () => {
  it('시작 전에는 실시간이다', () => {
    expect(afterDeath(DEATH_TIMING.skeletonizeMs - 50).deathTimeScale).toBe(1)
  })

  it('백골화가 끝나면 느려진다 — docs/06 은 0.3배속이라 적었다', () => {
    expect(afterDeath(DEATH_TIMING.skeletonizeMs + 100).deathTimeScale)
      .toBe(DEATH_TIMING.slowmo.scale)
  })

  it('1초 뒤에는 실시간으로 돌아온다', () => {
    const after = DEATH_TIMING.skeletonizeMs + DEATH_TIMING.slowmo.durationMs + 50
    expect(afterDeath(after).deathTimeScale).toBe(1)
  })

  it('죽지 않았으면 건드리지 않는다', () => {
    expect(new BreakDirector(1).deathTimeScale).toBe(1)
  })
})

describe('사망 채도 하강', () => {
  it('백골화 동안은 색이 그대로다', () => {
    expect(afterDeath(DEATH_TIMING.skeletonizeMs - 50).deathSaturation).toBe(1)
  })

  it('슬로우모션과 같은 구간에서 빠진다 — 한 동작으로 읽혀야 한다', () => {
    const half = DEATH_TIMING.skeletonizeMs + DEATH_TIMING.slowmo.durationMs / 2
    const mid = afterDeath(half).deathSaturation
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(0.7)
  })

  it('페이드가 시작될 때 0 에 닿는다', () => {
    const end = DEATH_TIMING.skeletonizeMs + DEATH_TIMING.slowmo.durationMs
    expect(afterDeath(end).deathSaturation).toBe(0)
  })

  it('끝난 뒤에도 0 을 유지한다 — 부활 직전에 색이 튀면 안 된다', () => {
    const late = DEATH_TIMING.skeletonizeMs + DEATH_TIMING.slowmo.durationMs + 400
    expect(afterDeath(late).deathSaturation).toBe(0)
  })
})

describe('백골 조각', () => {
  it('shatter 박자에서 나온다 — 그 전에는 없다', () => {
    expect(afterDeath(DEATH_TIMING.skeletonizeMs - 50).shards).toHaveLength(0)
    expect(afterDeath(DEATH_TIMING.skeletonizeMs + 50).shards)
      .toHaveLength(DEATH_TIMING.boneCount)
  })

  it('한 번만 나온다 — 매 프레임 쌓이면 화면이 뼈로 덮인다', () => {
    expect(afterDeath(DEATH_TIMING.skeletonizeMs + 600).shards)
      .toHaveLength(DEATH_TIMING.boneCount)
  })

  it('reset 이 전부 지운다', () => {
    const director = afterDeath(DEATH_TIMING.skeletonizeMs + 50)
    director.reset()
    expect(director.shards).toHaveLength(0)
    expect(director.deathTimeScale).toBe(1)
  })
})
