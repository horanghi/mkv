import { describe, expect, it } from 'vitest'
import { loadBalance } from '../../data/load.ts'
import { NO_TIMERS, canJump, consumeTimers, gravityHeld, stepTimers } from './jump.ts'

const p = loadBalance().player

describe('점프 가능 판정', () => {
  it('땅에 있고 버퍼가 있으면 뛴다', () => {
    expect(canJump(true, true, NO_TIMERS)).toBe(true)
  })

  it('버퍼가 없으면 안 뛴다', () => {
    expect(canJump(false, true, { coyoteFrames: 5, ledgeGripFrames: 2 })).toBe(false)
  })

  it('공중이고 코요테도 없으면 안 뛴다 — 2단 점프는 없다', () => {
    expect(canJump(true, false, NO_TIMERS)).toBe(false)
  })

  it('공중이어도 코요테가 남았으면 뛴다', () => {
    expect(canJump(true, false, { coyoteFrames: 1, ledgeGripFrames: 0 })).toBe(true)
  })
})

describe('코요테 타임', () => {
  it('땅에 있으면 5프레임으로 채워진다 — docs/02 2.2', () => {
    expect(p.coyoteFrames).toBe(5)
    expect(stepTimers(NO_TIMERS, true, p).coyoteFrames).toBe(5)
  })

  it('공중에서 한 프레임씩 깎인다', () => {
    let timers = stepTimers(NO_TIMERS, true, p)
    const seen: number[] = []
    for (let i = 0; i < 7; i += 1) {
      timers = stepTimers(timers, false, p)
      seen.push(timers.coyoteFrames)
    }
    expect(seen).toEqual([4, 3, 2, 1, 0, 0, 0])
  })

  it('발판을 벗어난 뒤 5프레임까지는 점프를 받아준다', () => {
    let timers = stepTimers(NO_TIMERS, true, p)
    for (let frame = 1; frame <= 5; frame += 1) {
      timers = stepTimers(timers, false, p)
      const stillAllowed = canJump(true, false, timers)
      expect(stillAllowed).toBe(frame < 5)
    }
  })

  it('점프하면 전부 소진된다 — 코요테로 두 번 뛰지 못한다', () => {
    expect(consumeTimers()).toEqual(NO_TIMERS)
    expect(canJump(true, false, consumeTimers())).toBe(false)
  })
})

describe('낙하 그립', () => {
  it('땅에서 2프레임으로 채워진다', () => {
    expect(p.ledgeGripFrames).toBe(2)
    expect(stepTimers(NO_TIMERS, true, p).ledgeGripFrames).toBe(2)
  })

  it('하강 중에만 중력을 멈춘다', () => {
    const held = { coyoteFrames: 5, ledgeGripFrames: 2 }
    expect(gravityHeld(held, 0)).toBe(true)
    expect(gravityHeld(held, 100)).toBe(true)
    // 점프로 떠오르는 중에는 적용되지 않는다.
    expect(gravityHeld(held, -420)).toBe(false)
  })

  it('만료되면 중력이 돌아온다', () => {
    expect(gravityHeld({ coyoteFrames: 5, ledgeGripFrames: 0 }, 10)).toBe(false)
  })
})
