import type { Aabb } from '../../physics/aabb.ts'
import { overlapsBlocking } from '../../physics/corner.ts'
import { substepCount } from '../../physics/body.ts'
import { mapBounds, type Tilemap } from '../../physics/tilemap.ts'
import type { WeaponBalance } from '../../data/balance.ts'
import type { AttackDirection } from '../player/attack.ts'

/**
 * 투사체.
 *
 * M0 는 창 하나뿐이고 궤도는 직선만 구현한다.
 * 포물선(횃불·도끼·망치)과 반사(원반)는 M2 다. → docs/03-weapons-magic.md 3.2
 */

export interface Projectile {
  readonly id: number
  readonly weaponId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** px/s */
  readonly vx: number
  readonly vy: number
  readonly damage: number
  readonly ageFrames: number
}

export interface ProjectileWorld {
  readonly projectiles: readonly Projectile[]
  readonly nextId: number
}

export const EMPTY_WORLD: ProjectileWorld = Object.freeze({
  projectiles: Object.freeze([]),
  nextId: 1,
})

/**
 * 투사체 히트박스 — 가로 10x2, 위아래로 던지면 눕는다. → docs/12-sprites.md
 *
 * **무기 종류와 무관하게 같다.** docs/03 의 무기 표에는 크기 칸이 없다 —
 * 데미지·연사·속도·궤도로 성격을 가르고 사거리는 가르지 않는다는 뜻이다.
 * 무기마다 다르게 하려면 문서의 표부터 늘려야 한다.
 *
 * m1-gate 진단표의 "투사체 크기" 처방은 **적** 투사체를 가리킨다.
 * 그쪽 레버는 `entities/bosses/hazard.ts` 의 `SIZES` 다.
 */
const SHOT_LENGTH = 10
const SHOT_THICKNESS = 2

export interface SpawnRequest {
  /** 플레이어 히트박스 */
  readonly origin: Aabb
  readonly facing: -1 | 1
  readonly direction: AttackDirection
}

export function boxOfProjectile(p: Projectile): Aabb {
  return { x: p.x, y: p.y, width: p.width, height: p.height }
}

/**
 * 손 위치에서 투사체를 만든다.
 *
 * 화면 동시 발사 상한을 넘으면 **무시한다.** 오래된 것을 지우지 않는다 —
 * 던진 창이 사라지는 것은 플레이어가 이해할 수 없는 일이다.
 * 상한은 성능 제한이 아니라 시리즈 규칙이고, 한 발 한 발을 신중하게 만든다.
 */
export function spawnProjectile(
  world: ProjectileWorld,
  weapon: WeaponBalance,
  request: SpawnRequest,
): ProjectileWorld {
  const live = world.projectiles.filter((p) => p.weaponId === weapon.id).length
  if (live >= weapon.maxOnScreen) return world

  const projectile = buildProjectile(world.nextId, weapon, request)
  return {
    projectiles: [...world.projectiles, projectile],
    nextId: world.nextId + 1,
  }
}

/**
 * 한 틱 전진.
 *
 * 지형에 닿거나 맵 밖으로 나가면 사라진다. 서브스텝은 바디와 같은 규칙이다 —
 * 320px/s 는 틱당 5px 라 한 걸음이면 충분하지만, 각성으로 빨라져도 뚫지 않는다.
 */
export function stepProjectiles(
  world: ProjectileWorld,
  map: Tilemap,
  dt: number,
): ProjectileWorld {
  if (world.projectiles.length === 0) return world

  const bounds = mapBounds(map)
  const alive: Projectile[] = []

  for (const projectile of world.projectiles) {
    const moved = advance(projectile, map, dt)
    if (moved && inside(moved, bounds)) alive.push(moved)
  }

  return { ...world, projectiles: alive }
}

/** 무기별 화면 잔여 발수. 디버그 오버레이가 상한과 함께 보여준다. */
export function countOf(world: ProjectileWorld, weaponId: string): number {
  return world.projectiles.filter((p) => p.weaponId === weaponId).length
}

function buildProjectile(
  id: number,
  weapon: WeaponBalance,
  request: SpawnRequest,
): Projectile {
  const vertical = request.direction === 'up' || request.direction === 'down'
  const width = vertical ? SHOT_THICKNESS : SHOT_LENGTH
  const height = vertical ? SHOT_LENGTH : SHOT_THICKNESS

  const { x, y, vx, vy } = launchFrom(request, weapon.speed, width, height)
  return { id, weaponId: weapon.id, x, y, width, height, vx, vy, damage: weapon.damage, ageFrames: 0 }
}

/** 방향별 손 위치. 히트박스 기준 상대 좌표다. */
function launchFrom(
  request: SpawnRequest,
  speed: number,
  width: number,
  height: number,
): { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number } {
  const { origin, facing, direction } = request
  const centerX = origin.x + origin.width / 2 - width / 2
  const front = facing === 1 ? origin.x + origin.width : origin.x - width

  switch (direction) {
    case 'up':
      return { x: centerX, y: origin.y - height, vx: 0, vy: -speed }
    case 'down':
      return { x: centerX, y: origin.y + origin.height, vx: 0, vy: speed }
    case 'crouch':
      // 웅크린 히트박스는 16px 이라 가슴 높이가 낮다.
      return { x: front, y: origin.y + origin.height * 0.4, vx: facing * speed, vy: 0 }
    default:
      return { x: front, y: origin.y + origin.height * 0.35, vx: facing * speed, vy: 0 }
  }
}

/** 지형에 닿으면 null. 창은 관통하지 않는다. */
function advance(projectile: Projectile, map: Tilemap, dt: number): Projectile | null {
  const dx = projectile.vx * dt
  const dy = projectile.vy * dt
  const steps = substepCount(dx, dy, map.tileSize)

  let current = projectile
  for (let i = 0; i < steps; i += 1) {
    current = { ...current, x: current.x + dx / steps, y: current.y + dy / steps }
    if (overlapsBlocking(boxOfProjectile(current), map)) return null
  }
  return { ...current, ageFrames: current.ageFrames + 1 }
}

function inside(projectile: Projectile, bounds: Aabb): boolean {
  return (
    projectile.x + projectile.width > bounds.x &&
    projectile.x < bounds.x + bounds.width &&
    projectile.y + projectile.height > bounds.y &&
    projectile.y < bounds.y + bounds.height
  )
}
