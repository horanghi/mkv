import type { PlayerBalance } from '../../data/balance.ts'
import type { InputState } from '../../core/input.ts'
import { isDown } from '../../core/input.ts'

/**
 * 공격 방향과 타이머.
 *
 * 원작에서 상하 공격이 불가능한 것은 "어려움"이 아니라 **부당함**이었다.
 * 머리 위 적을 때릴 수 없어 죽는 것은 플레이어의 실수가 아니다.
 * 대신 상단 공격의 후딜을 12프레임으로 늘려 남용을 막는다. → docs/02 2.4
 */

export const ATTACK_DIRECTIONS = ['forward', 'up', 'down', 'crouch'] as const
export type AttackDirection = (typeof ATTACK_DIRECTIONS)[number]

export interface AttackState {
  readonly direction: AttackDirection | null
  /** 발사까지 남은 프레임 */
  readonly startup: number
  /** 다음 공격까지 남은 프레임. 이 동안에도 이동은 된다. */
  readonly recovery: number
  /** 이번 틱에 투사체가 나가는가. m0-5 가 이 신호를 받는다. */
  readonly fired: boolean
}

export const IDLE_ATTACK: AttackState = Object.freeze({
  direction: null,
  startup: 0,
  recovery: 0,
  fired: false,
})

/** 대각선은 지원하지 않는다. 상하 입력이 좌우보다 우선한다. */
export function attackDirection(input: InputState, grounded: boolean): AttackDirection {
  if (isDown(input.held, 'up')) return 'up'
  if (isDown(input.held, 'down')) return grounded ? 'crouch' : 'down'
  return 'forward'
}

export function isBusy(attack: AttackState): boolean {
  return attack.startup > 0 || attack.recovery > 0
}

/**
 * 한 틱 전진.
 *
 * 발사 딜레이 3프레임 뒤에 투사체가 나가고, 그때부터 후딜이 시작된다.
 */
export function stepAttack(
  attack: AttackState,
  input: InputState,
  grounded: boolean,
  balance: PlayerBalance,
): AttackState {
  if (attack.startup > 1) {
    return { ...attack, startup: attack.startup - 1, fired: false }
  }

  if (attack.startup === 1) {
    const direction = attack.direction ?? 'forward'
    return {
      direction,
      startup: 0,
      recovery: recoveryFor(direction, balance),
      fired: true,
    }
  }

  if (attack.recovery > 0) {
    return { ...attack, recovery: attack.recovery - 1, fired: false }
  }

  if (isDown(input.pressed, 'attack')) {
    return {
      direction: attackDirection(input, grounded),
      startup: balance.attackStartupFrames,
      recovery: 0,
      fired: false,
    }
  }

  return { ...IDLE_ATTACK, direction: attack.direction }
}

function recoveryFor(direction: AttackDirection, balance: PlayerBalance): number {
  return direction === 'up' ? balance.attackUpRecoveryFrames : balance.attackRecoveryFrames
}
