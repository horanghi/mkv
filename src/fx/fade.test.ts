import { describe, expect, it } from 'vitest'
import { COVER_MS, NO_FADE, REVEAL_MS, stepFade, type Fade } from './fade.ts'

/** `ms` 동안 같은 방향으로 흘린다. */
function hold(fade: Fade, covering: boolean, ms: number): Fade {
  let current = fade
  for (let left = ms; left > 0; left -= 10) current = stepFade(current, covering, 10)
  return current
}

describe('사망 페이드', () => {
  it('처음에는 투명하다', () => {
    expect(NO_FADE.alpha).toBe(0)
  })

  it('덮으면 검게 찬다', () => {
    expect(hold(NO_FADE, true, COVER_MS).alpha).toBe(1)
  })

  it('걷으면 투명해진다', () => {
    expect(hold({ alpha: 1 }, false, REVEAL_MS).alpha).toBe(0)
  })

  it('덮는 쪽이 걷는 쪽보다 빠르다 — 카메라 이동을 가려야 한다', () => {
    expect(COVER_MS).toBeLessThan(REVEAL_MS)
  })

  it('둘을 합쳐도 재시작 3초 예산 안이다', () => {
    expect(COVER_MS + REVEAL_MS).toBeLessThan(3000)
  })

  it('도중에 방향이 바뀌어도 튀지 않는다 — 부활하자마자 또 죽는 경우가 있다', () => {
    const half = hold(NO_FADE, true, COVER_MS / 2)
    expect(half.alpha).toBeGreaterThan(0)
    expect(half.alpha).toBeLessThan(1)

    const back = stepFade(half, false, 10)
    expect(back.alpha).toBeLessThan(half.alpha)
    expect(back.alpha).toBeGreaterThan(0)
  })

  it('목표에 닿으면 같은 값을 돌려준다 — 새 객체를 만들지 않는다', () => {
    const black = hold(NO_FADE, true, COVER_MS * 2)
    expect(stepFade(black, true, 16)).toBe(black)
  })

  it('음수 프레임에도 견딘다', () => {
    expect(stepFade(NO_FADE, true, -100).alpha).toBe(0)
  })
})
