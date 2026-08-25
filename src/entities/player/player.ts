import { consumeBuffer, hasBuffered, isDown, type InputState } from '../../core/input.ts'
import type { PlayerBalance } from '../../data/balance.ts'
import { boxOf, createBody, resolve, type Body } from '../../physics/body.ts'
import { cornerCorrect, overlapsBlocking } from '../../physics/corner.ts'
import type { TileCoord, Tilemap } from '../../physics/tilemap.ts'
import { IDLE_ATTACK, stepAttack, type AttackState } from './attack.ts'
import { NO_TIMERS, canJump, consumeTimers, gravityHeld, stepTimers, type JumpTimers } from './jump.ts'
import { stepGravity, stepHorizontal } from './movement.ts'

/**
 * 랜슬 상태 머신.
 *
 * 모든 수치는 `src/data/player.json`(원본은 `docs/02-core-mechanics.md`)에서 온다.
 * 여기에 상수를 쓰지 않는다.
 */

export const PLAYER_STATES = ['idle', 'run', 'jump', 'fall', 'crouch'] as const
export type PlayerState = (typeof PLAYER_STATES)[number]

export interface Player {
  readonly body: Body
  readonly state: PlayerState
  readonly facing: -1 | 1
  readonly timers: JumpTimers
  readonly attack: AttackState
  readonly crouching: boolean
  /** 이번 틱에 이륙했는가. 연출·SFX 신호. */
  readonly jumped: boolean
  /** 이번 틱에 착지했는가. */
  readonly landed: boolean
}

export interface PlayerStep {
  readonly player: Player
  /** 점프 버퍼 소비가 반영된 입력 */
  readonly input: InputState
  readonly crumbled: readonly TileCoord[]
}

export function createPlayer(x: number, y: number, balance: PlayerBalance): Player {
  return {
    body: createBody(x, y, balance.hitbox.width, balance.hitbox.height),
    state: 'fall',
    facing: 1,
    timers: NO_TIMERS,
    attack: IDLE_ATTACK,
    crouching: false,
    jumped: false,
    landed: false,
  }
}

/**
 * 한 틱.
 *
 * 순서가 곧 규칙이다.
 *   1. 웅크리기 — 히트박스가 바뀌므로 가장 먼저
 *   2. 수평 — 지상에서만 가속한다
 *   3. 점프 — 버퍼와 코요테를 여기서 소비한다
 *   4. 중력 — 이륙한 틱에는 먹이지 않는다
 *   5. 모서리 보정 — 상승 중 천장에 걸릴 때만
 *   6. 충돌 해소
 *   7. 관용 타이머 · 공격 타이머 · 상태 갱신
 */
export interface PlayerStepOptions {
  /** 갑옷 상태의 이동 속도 보정. `vitals.speedMultiplier` 가 준다. */
  readonly speedScale?: number
}

export function stepPlayer(
  player: Player,
  input: InputState,
  map: Tilemap,
  balance: PlayerBalance,
  dt: number,
  options: PlayerStepOptions = {},
): PlayerStep {
  const wasGrounded = player.body.onGround

  const crouched = stepCrouch(player, input, map, balance)
  let body = crouched.body
  const crouching = crouched.crouching

  body = {
    ...body,
    vx: stepHorizontal(
      body.vx, input.moveAxis, wasGrounded, crouching, balance, dt, options.speedScale ?? 1,
    ),
  }

  let timers = player.timers
  let nextInput = input
  const jumped = canJump(hasBuffered(input, 'jump'), wasGrounded, timers) && !crouching

  if (jumped) {
    body = { ...body, vy: balance.jumpVelocity }
    timers = consumeTimers()
    nextInput = consumeBuffer(input, 'jump')
  } else if (!gravityHeld(timers, body.vy)) {
    body = { ...body, vy: stepGravity(body.vy, balance, dt) }
  }

  const corrected = cornerCorrect(body, map, dt, balance.cornerCorrectionPx)
  const resolved = resolve(corrected.body, map, dt, { dropThrough: wantsDropThrough(input, wasGrounded) })
  body = resolved.body

  timers = jumped ? timers : stepTimers(timers, body.onGround, balance)

  return {
    player: {
      body,
      state: deriveState(body, crouching),
      facing: input.moveAxis === 0 ? player.facing : input.moveAxis,
      timers,
      attack: stepAttack(player.attack, input, body.onGround, balance),
      crouching,
      jumped,
      landed: !wasGrounded && body.onGround,
    },
    input: nextInput,
    crumbled: resolved.crumbled,
  }
}

/**
 * 웅크리기 전환.
 *
 * 히트박스가 12x26 에서 12x16 으로 줄고 발 위치는 그대로다.
 * 일어설 자리가 없으면 웅크린 채로 남는다 — 지형에 끼는 것을 막는다.
 */
function stepCrouch(
  player: Player,
  input: InputState,
  map: Tilemap,
  balance: PlayerBalance,
): { readonly body: Body; readonly crouching: boolean } {
  const wants = player.body.onGround && isDown(input.held, 'down')
  if (wants === player.crouching) return { body: player.body, crouching: player.crouching }

  const drop = balance.hitbox.height - balance.crouchHitbox.height

  if (wants) {
    return {
      body: {
        ...player.body,
        y: player.body.y + drop,
        width: balance.crouchHitbox.width,
        height: balance.crouchHitbox.height,
      },
      crouching: true,
    }
  }

  const standing: Body = {
    ...player.body,
    y: player.body.y - drop,
    width: balance.hitbox.width,
    height: balance.hitbox.height,
  }
  if (overlapsBlocking(boxOf(standing), map)) {
    return { body: player.body, crouching: true }
  }
  return { body: standing, crouching: false }
}

/** 아래 + 점프로 원웨이 발판을 빠져나간다. */
function wantsDropThrough(input: InputState, grounded: boolean): boolean {
  return grounded && isDown(input.held, 'down') && hasBuffered(input, 'jump')
}

function deriveState(body: Body, crouching: boolean): PlayerState {
  if (!body.onGround) return body.vy < 0 ? 'jump' : 'fall'
  if (crouching) return 'crouch'
  return Math.abs(body.vx) > 1 ? 'run' : 'idle'
}
