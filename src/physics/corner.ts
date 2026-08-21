import type { Aabb } from './aabb.ts'
import { boxOf, resolve, type Body } from './body.ts'
import { forEachTile, isBlocking, type Tilemap } from './tilemap.ts'

/**
 * 모서리 보정 — 관용 장치.
 *
 * 상승 중에 머리가 천장 모서리에 살짝 걸리면 옆으로 밀어 통과시킨다.
 * 몇 픽셀 차이로 점프가 죽는 것은 어려움이 아니라 **부당함**이다.
 *
 * 고정 점프 궤도 규칙은 건드리지 않는다. 수평 속도는 그대로 두고 위치만 민다.
 * → docs/02-core-mechanics.md 2.2
 */

export interface CornerCorrection {
  readonly body: Body
  /** 밀어낸 거리(px). 0 이면 보정하지 않았다. */
  readonly nudge: number
}

/**
 * 상승 중 천장에 막힐 때 좌우로 최대 `maxPx` 까지 밀어 본다.
 *
 * 진행 방향을 먼저 시도한다 — 플레이어가 가려던 쪽으로 빠지는 것이 자연스럽다.
 * 어느 쪽으로도 못 빠지면 원본을 그대로 돌려준다.
 */
export function cornerCorrect(
  body: Body,
  map: Tilemap,
  dt: number,
  maxPx: number,
): CornerCorrection {
  if (body.vy >= 0) return { body, nudge: 0 }
  if (!resolve(body, map, dt).body.hitCeiling) return { body, nudge: 0 }

  // vx 가 0 이면 오른쪽부터. 임의의 규칙이지만 결정론을 위해 고정한다.
  const preferred = body.vx < 0 ? -1 : 1

  for (let offset = 1; offset <= maxPx; offset += 1) {
    for (const direction of [preferred, -preferred]) {
      const nudge = direction * offset
      const shifted: Body = { ...body, x: body.x + nudge }
      const attempt = resolve(shifted, map, dt).body
      if (!attempt.hitCeiling && !attempt.hitWall) return { body: shifted, nudge }
    }
  }

  return { body, nudge: 0 }
}

/** 상자가 막는 타일과 겹치는가. 웅크렸다 일어설 때 머리 공간 확인에 쓴다. */
export function overlapsBlocking(box: Aabb, map: Tilemap): boolean {
  let blocked = false
  forEachTile(map, box, (kind) => {
    if (isBlocking(kind)) blocked = true
  })
  return blocked
}

/** 바디가 지금 지형에 끼어 있는가. */
export function isStuck(body: Body, map: Tilemap): boolean {
  return overlapsBlocking(boxOf(body), map)
}
