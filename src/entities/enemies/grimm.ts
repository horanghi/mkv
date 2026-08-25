import { resolve } from '../../physics/body.ts'
import type { Tilemap } from '../../physics/tilemap.ts'
import { boxOfEnemy, distanceTo, setState, type Enemy } from './enemy.ts'

/**
 * 그림 (Grimm) — HP 30. 시리즈 전통의 트라우마.
 *
 * **이 게임에서 가장 미움받아야 할 적**이면서 동시에 가장 공정해야 한다.
 * 고정 점프 궤도와 최악의 상성이라, 공중에서 만나면 회피할 수 없다.
 * 그래서 플레이어는 **점프 전에 그림의 위치를 반드시 확인**하게 된다.
 * 이것이 이 게임의 사고 루프를 강제하는 핵심 장치다.
 *
 * 규칙이 하나라도 깨지면 그림은 가르치는 것을 멈추고 속이기 시작한다.
 * → docs/05-enemies-bosses.md 5.2
 */

export const GRIMM = {
  /** 이 반경에 들어오면 이륙한다. 플레이어가 거리를 통제할 수 있다. */
  aggroRadius: 120,
  speed: 90,
  /** 사인파 궤도의 진폭과 주기. 직선으로 오면 피하기 쉽고 긴장이 없다. */
  waveAmplitude: 26,
  waveHz: 1.1,
  /** 착지 후 정지. **유일한 확정 공격 타이밍이다.** */
  landedFrames: 180,
} as const

export interface GrimmContext {
  readonly target: { readonly x: number; readonly y: number }
  /** 화면에 보이는 영역. 그림은 화면 밖에서 스폰되지 않는다. */
  readonly view: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

export function stepGrimm(
  enemy: Enemy,
  map: Tilemap,
  ctx: GrimmContext,
  gravity: number,
  dt: number,
): Enemy {
  if (enemy.dead) return enemy

  switch (enemy.state) {
    case 'dormant':
      return stepDormant(enemy, ctx)
    case 'landed':
      return stepLanded(enemy, map, gravity, dt)
    default:
      return stepChase(enemy, map, ctx, dt)
  }
}

/**
 * 대기 — 벽이나 천장에 붙어 정지.
 *
 * **화면 안에서 먼저 보여야 한다.** 안 보이는 곳에서 날아오면 부당한 죽음이 된다.
 */
function stepDormant(enemy: Enemy, ctx: GrimmContext): Enemy {
  const waiting = setState({ ...enemy, body: { ...enemy.body, vx: 0, vy: 0 } }, 'dormant')
  if (!isVisible(waiting, ctx.view)) return waiting
  if (distanceTo(waiting, ctx.target) > GRIMM.aggroRadius) return waiting
  return setState(waiting, 'chase')
}

/** 추적 — 사인파 궤도로 플레이어를 향해 간다. */
function stepChase(enemy: Enemy, map: Tilemap, ctx: GrimmContext, dt: number): Enemy {
  const box = boxOfEnemy(enemy)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  const dx = ctx.target.x - cx
  const dy = ctx.target.y - cy
  const length = Math.hypot(dx, dy) || 1

  // 진행 방향에 수직으로 흔든다. 그래야 목표를 향하면서도 궤도가 굽는다.
  const t = (enemy.stateFrames / 60) * GRIMM.waveHz * Math.PI * 2
  const wave = Math.sin(t) * GRIMM.waveAmplitude
  const vx = (dx / length) * GRIMM.speed + (-dy / length) * wave
  const vy = (dy / length) * GRIMM.speed + (dx / length) * wave

  const resolved = resolve({ ...enemy.body, vx, vy }, map, dt)
  const chasing = setState(
    { ...enemy, body: resolved.body, facing: dx < 0 ? -1 : 1 },
    'chase',
  )

  // 지면에 닿으면 멈춘다 — 잡을 수 있는 틈을 명시적으로 준다.
  if (resolved.body.onGround) return setState(chasing, 'landed')
  return chasing
}

/** 착지 — 3초 정지. 이 창이 없으면 그림은 잡을 수 없는 적이 된다. */
function stepLanded(enemy: Enemy, map: Tilemap, gravity: number, dt: number): Enemy {
  const vy = Math.min(480, enemy.body.vy + gravity * dt)
  const resolved = resolve({ ...enemy.body, vx: 0, vy }, map, dt)
  const resting = setState({ ...enemy, body: resolved.body }, 'landed')
  if (resting.stateFrames < GRIMM.landedFrames) return resting
  return setState(resting, 'chase')
}

/** 착지 정지 중인가. 플레이어에게 "지금이다"를 보여줄 신호. */
export function isStunned(enemy: Enemy): boolean {
  return enemy.state === 'landed' && enemy.stateFrames < GRIMM.landedFrames
}

function isVisible(
  enemy: Enemy,
  view: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  const box = boxOfEnemy(enemy)
  return (
    box.x + box.width > view.x &&
    box.x < view.x + view.width &&
    box.y + box.height > view.y &&
    box.y < view.y + view.height
  )
}
