import { resolve } from '../../physics/body.ts'
import type { Tilemap } from '../../physics/tilemap.ts'
import { boxOfEnemy, setState, type Enemy } from './enemy.ts'

/**
 * 까마귀 (Corvid) — HP 12.
 *
 * 정지 → 급강하 → 활공. **급강하 중에는 궤도를 바꾸지 않는다.**
 * 유도하면 피할 방법이 없어지고, 고정 점프 궤도와 겹쳐 부당해진다.
 * 대신 한 번 지나가면 다시 오지 않으므로 플레이어가 통과할 수 있다.
 * → docs/05-enemies-bosses.md 5.2
 */

export const CORVID = {
  /** 플레이어가 이 가로 거리 안으로 들어오면 급강하한다. */
  triggerX: 40,
  /** 플레이어가 아래에 있어야 한다. 위에 있으면 반응하지 않는다. */
  triggerBelow: 16,
  diveSpeed: 210,
  /** 급강하 각도 — 아래 앞쪽으로. */
  diveAngle: 0.9,
  glideSpeed: 150,
} as const

export function stepCorvid(
  enemy: Enemy,
  map: Tilemap,
  target: { readonly x: number; readonly y: number },
  dt: number,
): Enemy {
  if (enemy.dead) return enemy

  if (enemy.state === 'perch') {
    const waiting = setState({ ...enemy, body: { ...enemy.body, vx: 0, vy: 0 } }, 'perch')
    if (!shouldDive(waiting, target)) return waiting

    // 지금 이 순간의 방향으로 궤도를 고정한다. 이후에는 바꾸지 않는다.
    const box = boxOfEnemy(waiting)
    const facing: -1 | 1 = target.x < box.x + box.width / 2 ? -1 : 1
    return setState(
      {
        ...waiting,
        facing,
        body: {
          ...waiting.body,
          vx: facing * CORVID.diveSpeed * Math.cos(CORVID.diveAngle),
          vy: CORVID.diveSpeed * Math.sin(CORVID.diveAngle),
        },
      },
      'dive',
    )
  }

  // 급강하·활공 — 속도를 그대로 유지한다. 유도하지 않는다.
  const resolved = resolve(enemy.body, map, dt)
  const diving = setState({ ...enemy, body: resolved.body }, enemy.state)

  // 지면에 닿으면 활공으로 전환해 수평으로 빠져나간다.
  if (enemy.state === 'dive' && (resolved.body.onGround || resolved.body.hitWall)) {
    return setState(
      { ...diving, body: { ...resolved.body, vx: diving.facing * CORVID.glideSpeed, vy: -40 } },
      'glide',
    )
  }
  return diving
}

function shouldDive(enemy: Enemy, target: { readonly x: number; readonly y: number }): boolean {
  const box = boxOfEnemy(enemy)
  const cx = box.x + box.width / 2
  const below = target.y - (box.y + box.height)
  return Math.abs(target.x - cx) <= CORVID.triggerX && below >= CORVID.triggerBelow
}

/** 급강하 중인가. 이 동안은 궤도가 고정이다. */
export function isCommitted(enemy: Enemy): boolean {
  return enemy.state === 'dive' || enemy.state === 'glide'
}
