import { describe, expect, it } from 'vitest'
import {
  INITIAL_INPUT,
  advanceInput,
  frameOf,
  type Action,
  type InputState,
} from '../../core/input.ts'
import { loadBalance } from '../../data/load.ts'
import { IDLE_ATTACK, attackDirection, isBusy, stepAttack, type AttackState } from './attack.ts'

const p = loadBalance().player

function inputOf(...actions: readonly Action[]): InputState {
  return advanceInput(INITIAL_INPUT, frameOf(...actions))
}

/** 공격 하나를 끝까지 돌리고 각 틱의 상태를 모은다. */
function run(first: InputState, ticks: number, grounded = true): AttackState[] {
  const history: AttackState[] = []
  let attack = IDLE_ATTACK
  let input = first
  for (let i = 0; i < ticks; i += 1) {
    attack = stepAttack(attack, input, grounded, p)
    history.push(attack)
    input = advanceInput(input, input.held) // 계속 누르고 있는 상태
  }
  return history
}

describe('공격 방향', () => {
  it('기본은 정면이다', () => {
    expect(attackDirection(inputOf('attack'), true)).toBe('forward')
  })

  it('위를 누르면 수직 상단 — 원작에서 불가능했던 것', () => {
    expect(attackDirection(inputOf('up', 'attack'), true)).toBe('up')
  })

  it('지상에서 아래는 웅크린 수평이다', () => {
    expect(attackDirection(inputOf('down', 'attack'), true)).toBe('crouch')
  })

  it('공중에서 아래는 수직 하단이다', () => {
    expect(attackDirection(inputOf('down', 'attack'), false)).toBe('down')
  })

  it('대각선은 없다 — 상하가 좌우보다 우선한다', () => {
    expect(attackDirection(inputOf('up', 'right', 'attack'), true)).toBe('up')
    expect(attackDirection(inputOf('down', 'left', 'attack'), false)).toBe('down')
  })
})

describe('타이밍', () => {
  it('3프레임 뒤에 발사된다 — docs/02 2.4', () => {
    expect(p.attackStartupFrames).toBe(3)
    // 누른 틱이 0, 투사체는 3틱 뒤에 나간다 = 50ms.
    const history = run(inputOf('attack'), 6)
    const firedAt = history.findIndex((a) => a.fired)
    expect(firedAt).toBe(p.attackStartupFrames)
  })

  it('발사는 한 틱만이다', () => {
    const history = run(inputOf('attack'), 20)
    expect(history.filter((a) => a.fired)).toHaveLength(1)
  })

  it('정면 후딜은 8프레임이다', () => {
    const history = run(inputOf('attack'), 20)
    const firedAt = history.findIndex((a) => a.fired)
    expect(history[firedAt]?.recovery).toBe(8)
  })

  it('상단 공격 후딜은 12프레임이다 — 남용 방지', () => {
    expect(p.attackUpRecoveryFrames).toBe(12)
    const history = run(inputOf('up', 'attack'), 20)
    const firedAt = history.findIndex((a) => a.fired)
    expect(history[firedAt]?.direction).toBe('up')
    expect(history[firedAt]?.recovery).toBe(12)
  })

  it('후딜 중에는 다음 공격이 나가지 않는다', () => {
    // 계속 누르고 있어도 발사는 한 번뿐이다 (누른 순간만 받는다).
    const history = run(inputOf('attack'), 30)
    expect(history.filter((a) => a.fired)).toHaveLength(1)
  })

  it('후딜이 끝나면 다시 쏠 수 있다', () => {
    let attack = IDLE_ATTACK
    let input = inputOf('attack')
    let fired = 0

    for (let i = 0; i < 40; i += 1) {
      attack = stepAttack(attack, input, true, p)
      if (attack.fired) fired += 1
      // 한 틱 떼었다가 다시 누른다 — 연타.
      input = advanceInput(input, i % 2 === 0 ? 0 : frameOf('attack'))
    }
    expect(fired).toBeGreaterThan(1)
  })

  it('바쁜 상태를 알려준다', () => {
    expect(isBusy(IDLE_ATTACK)).toBe(false)
    expect(isBusy({ ...IDLE_ATTACK, startup: 1 })).toBe(true)
    expect(isBusy({ ...IDLE_ATTACK, recovery: 4 })).toBe(true)
  })

  it('입력이 없으면 아무 일도 없다', () => {
    const history = run(INITIAL_INPUT, 10)
    expect(history.every((a) => !a.fired && a.startup === 0 && a.recovery === 0)).toBe(true)
  })
})
