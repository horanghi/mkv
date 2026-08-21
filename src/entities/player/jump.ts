import type { PlayerBalance } from '../../data/balance.ts'

/**
 * 점프와 관용 장치.
 *
 * 코요테 타임과 점프 버퍼는 **불합리한 실패만** 없앤다.
 * 고정 궤도 규칙을 무르게 만들지 않는다. → docs/02-core-mechanics.md 2.2, 2.3
 */

export interface JumpTimers {
  /** 발판을 벗어난 뒤에도 점프를 받아주는 남은 프레임 */
  readonly coyoteFrames: number
  /** 발판 끝에서 떨어지기 시작할 때 중력을 늦추는 남은 프레임 */
  readonly ledgeGripFrames: number
}

export const NO_TIMERS: JumpTimers = Object.freeze({ coyoteFrames: 0, ledgeGripFrames: 0 })

/**
 * 지금 점프할 수 있는가.
 *
 * 버퍼된 입력이 있고, 땅에 있거나 코요테 타임이 남아 있으면 된다.
 * 공중 2단 점프는 없다.
 */
export function canJump(buffered: boolean, grounded: boolean, timers: JumpTimers): boolean {
  return buffered && (grounded || timers.coyoteFrames > 0)
}

/** 땅에 있으면 관용 프레임을 채우고, 공중이면 깎는다. */
export function stepTimers(
  timers: JumpTimers,
  grounded: boolean,
  balance: PlayerBalance,
): JumpTimers {
  if (grounded) {
    return {
      coyoteFrames: balance.coyoteFrames,
      ledgeGripFrames: balance.ledgeGripFrames,
    }
  }
  return {
    coyoteFrames: Math.max(0, timers.coyoteFrames - 1),
    ledgeGripFrames: Math.max(0, timers.ledgeGripFrames - 1),
  }
}

/** 점프한 순간 관용 프레임은 전부 소진된다. 코요테로 두 번 뛰지 못한다. */
export function consumeTimers(): JumpTimers {
  return NO_TIMERS
}

/**
 * 낙하 그립이 살아 있는 동안 중력을 멈춘다.
 *
 * 발판 끝을 밟고 걸어 나갈 때 곧바로 미끄러지듯 떨어지는 감각을 없앤다.
 * 점프로 떠오르는 중(vy < 0)에는 적용되지 않는다.
 *
 * > 이 해석은 `docs/02` 의 "낙하 그립 2프레임 — 발판 끝 밟았을 때 미끄러짐 방지"를
 * > 구현한 것이다. M0 게이트에서 감각을 확인하고 확정한다.
 */
export function gravityHeld(timers: JumpTimers, vy: number): boolean {
  return timers.ledgeGripFrames > 0 && vy >= 0
}
