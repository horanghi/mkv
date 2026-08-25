import type { Aabb } from '../../physics/aabb.ts'
import { substepCount } from '../../physics/body.ts'
import { TILE, mapBounds, tileAt, type Tilemap } from '../../physics/tilemap.ts'

/**
 * 보스가 내보내는 위험물 — 묘비와 낙석.
 *
 * 플레이어의 투사체(`entities/projectiles/`)와 **반대 방향**이다.
 * 저쪽은 플레이어가 적을 때리고, 이쪽은 적이 플레이어를 때린다.
 * 목록을 나눈 이유는 판정 방향이 다르기 때문이다 — 섞으면 보스가 자기 낙석에
 * 맞는다.
 *
 * → docs/05 5.4 캐른 · docs/04 STAGE 1
 */

export const HAZARD_KINDS = ['gravestone', 'rock'] as const
export type HazardKind = (typeof HAZARD_KINDS)[number]

export interface Hazard {
  readonly id: number
  readonly kind: HazardKind
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** px/s */
  readonly vx: number
  readonly vy: number
  readonly ageFrames: number
}

export interface HazardWorld {
  readonly hazards: readonly Hazard[]
  readonly nextId: number
}

export const EMPTY_HAZARDS: HazardWorld = Object.freeze({
  hazards: Object.freeze([]) as readonly Hazard[],
  nextId: 1,
})

const SIZES: Readonly<Record<HazardKind, { readonly width: number; readonly height: number }>> = {
  gravestone: { width: 10, height: 12 },
  rock: { width: 10, height: 10 },
}

/**
 * 화면에 동시에 존재할 수 있는 상한.
 *
 * 넘으면 **새로 만들지 않는다.** 오래된 것을 지우면 이미 피하려고 자리를 잡은
 * 플레이어의 판단이 무효가 된다 — 플레이어 투사체와 같은 원칙이다.
 */
export const MAX_HAZARDS = 12

/** 낙석의 낙하 시작 속도. 0 이면 한참 떠 있어 예고가 흐려진다. */
export const ROCK_INITIAL_VY = 60

export function spawnHazard(
  world: HazardWorld,
  kind: HazardKind,
  spawn: { readonly x: number; readonly y: number; readonly vx?: number; readonly vy?: number },
): HazardWorld {
  if (world.hazards.length >= MAX_HAZARDS) return world

  const size = SIZES[kind]
  const hazard: Hazard = {
    id: world.nextId,
    kind,
    x: spawn.x - size.width / 2,
    y: spawn.y - size.height / 2,
    width: size.width,
    height: size.height,
    vx: spawn.vx ?? 0,
    vy: spawn.vy ?? (kind === 'rock' ? ROCK_INITIAL_VY : 0),
    ageFrames: 0,
  }
  return { hazards: [...world.hazards, hazard], nextId: world.nextId + 1 }
}

export function boxOfHazard(hazard: Hazard): Aabb {
  return { x: hazard.x, y: hazard.y, width: hazard.width, height: hazard.height }
}

/** 이 위험물이 벽이나 바닥에 닿았는가. 닿으면 부서진다. */
function hitsTerrain(hazard: Hazard, map: Tilemap): boolean {
  const size = map.tileSize
  const left = Math.floor(hazard.x / size)
  const right = Math.floor((hazard.x + hazard.width - 1) / size)
  const top = Math.floor(hazard.y / size)
  const bottom = Math.floor((hazard.y + hazard.height - 1) / size)

  for (let ty = top; ty <= bottom; ty += 1) {
    for (let tx = left; tx <= right; tx += 1) {
      const kind = tileAt(map, tx, ty)
      // 원웨이는 통과한다 — 낙석이 얇은 발판에 걸려 공중에 멈추면 읽을 수 없다.
      if (kind === TILE.solid || kind === TILE.crumbling) return true
    }
  }
  return false
}

/**
 * 한 틱.
 *
 * 중력을 받고, 지형에 닿거나 화면 밖으로 나가면 사라진다.
 * 서브스텝은 플레이어 투사체와 같은 이유다 — 한 틱에 타일 크기보다 많이
 * 움직이면 얇은 지형을 뚫는다.
 */
export function stepHazards(
  world: HazardWorld,
  map: Tilemap,
  gravity: number,
  dt: number,
): HazardWorld {
  const bounds = mapBounds(map)

  const next = world.hazards
    .map((hazard) => {
      const steps = Math.max(1, substepCount(hazard.vx * dt, hazard.vy * dt, map.tileSize))
      let moved = hazard
      for (let i = 0; i < steps; i += 1) {
        const vy = moved.vy + gravity * (dt / steps)
        moved = {
          ...moved,
          x: moved.x + moved.vx * (dt / steps),
          y: moved.y + vy * (dt / steps),
          vy,
        }
        if (hitsTerrain(moved, map)) return null
      }
      return { ...moved, ageFrames: moved.ageFrames + 1 }
    })
    .filter((hazard): hazard is Hazard => hazard !== null)
    .filter((hazard) =>
      hazard.x + hazard.width > 0
      && hazard.x < bounds.width
      && hazard.y < bounds.height + 64)

  return next.length === world.hazards.length && next.every((h, i) => h === world.hazards[i])
    ? world
    : { ...world, hazards: next }
}

/** 전부 치운다. 부활·재시작에 쓴다. */
export function clearHazards(world: HazardWorld): HazardWorld {
  return world.hazards.length === 0 ? world : { ...world, hazards: [] }
}
