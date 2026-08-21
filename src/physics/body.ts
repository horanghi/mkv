import { bottom, right, type Aabb } from './aabb.ts'
import {
  TILE,
  forEachTile,
  isBlocking,
  isOneWay,
  tileBounds,
  type TileCoord,
  type TileKind,
  type Tilemap,
} from './tilemap.ts'

/**
 * 물리 바디와 타일 충돌 해소.
 *
 * `resolve` 는 **새 바디를 돌려준다.** 원본을 건드리지 않는다 —
 * 리플레이·롤백·골든 테스트가 전부 여기에 기댄다.
 *
 * → docs/10-tech-spec.md 10.4
 */

export interface Body {
  /** 좌상단 */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** px/s */
  readonly vx: number
  readonly vy: number
  readonly onGround: boolean
  readonly hitCeiling: boolean
  readonly hitWall: boolean
}

export interface ResolveOptions {
  /** 원웨이 발판을 아래로 빠져나간다 (↓ + 점프) */
  readonly dropThrough?: boolean
}

export interface ResolveResult {
  readonly body: Body
  /** 이번 이동에서 밟은 붕괴 타일. 타이머는 `crumble.ts` 가 관리한다. */
  readonly crumbled: readonly TileCoord[]
}

export function createBody(
  x: number,
  y: number,
  width: number,
  height: number,
  velocity: { readonly vx?: number; readonly vy?: number } = {},
): Body {
  return {
    x,
    y,
    width,
    height,
    vx: velocity.vx ?? 0,
    vy: velocity.vy ?? 0,
    onGround: false,
    hitCeiling: false,
    hitWall: false,
  }
}

export function boxOf(body: Body): Aabb {
  return { x: body.x, y: body.y, width: body.width, height: body.height }
}

/**
 * 속도만큼 움직이고 타일과의 충돌을 푼다.
 *
 * 축을 분리해 **X 를 먼저, 그 다음 Y** 를 푼다(docs/10.4). 한 번에 풀면
 * 모서리에서 어느 축으로 밀어낼지가 모호해지고, 벽에 붙어 걷다가 튀어오른다.
 */
export function resolve(
  body: Body,
  map: Tilemap,
  dt: number,
  options: ResolveOptions = {},
): ResolveResult {
  const dx = body.vx * dt
  const dy = body.vy * dt
  const steps = substepCount(dx, dy, map.tileSize)

  const crumbled: TileCoord[] = []
  let current: Body = { ...body, onGround: false, hitCeiling: false, hitWall: false }

  for (let i = 0; i < steps; i += 1) {
    current = moveX(current, dx / steps, map)
    current = moveY(current, dy / steps, map, options.dropThrough === true, crumbled)
  }

  // 세로로 전혀 움직이지 않은 틱에는 착지 판정이 나올 수 없다. 가만히 서 있는
  // 몸이 매 틱 공중으로 보고되는 것을 막는다. 상승·하강 중에는 건드리지 않는다.
  if (!current.onGround && dy === 0 && isGrounded(current, map)) {
    current = { ...current, onGround: true }
  }

  return { body: current, crumbled }
}

/**
 * 한 서브스텝이 타일 한 칸을 넘지 않게 쪼갠다.
 *
 * 이동량이 타일 크기 이하이면 어떤 크기의 상자도 단단한 타일을 건너뛸 수 없다.
 * 총알처럼 빠른 것이 벽을 통과하는 사고가 여기서 막힌다.
 */
export function substepCount(dx: number, dy: number, tileSize: number): number {
  const furthest = Math.max(Math.abs(dx), Math.abs(dy))
  if (!Number.isFinite(furthest) || furthest <= tileSize) return 1
  return Math.ceil(furthest / tileSize)
}

/**
 * 발밑 1px 을 훑어 접지 여부를 본다.
 *
 * `body.onGround` 는 "이번 이동이 지면에 막혔다"이고 이쪽은 "지금 딛고 있다"다.
 * 코요테 타임(m0-4)처럼 속도와 무관한 판단에는 이쪽이 필요하다.
 */
export function isGrounded(body: Body, map: Tilemap): boolean {
  const probe: Aabb = { x: body.x, y: bottom(boxOf(body)), width: body.width, height: 1 }
  let grounded = false
  forEachTile(map, probe, (kind) => {
    if (isBlocking(kind) || isOneWay(kind)) grounded = true
  })
  return grounded
}

function moveX(body: Body, step: number, map: Tilemap): Body {
  if (step === 0) return body

  const moved: Body = { ...body, x: body.x + step }
  let resolvedX = moved.x
  let blocked = false

  forEachTile(map, boxOf(moved), (kind, tx, ty) => {
    // 원웨이와 위험 타일은 가로로 막지 않는다.
    if (!isBlocking(kind)) return
    const tile = tileBounds(map, tx, ty)
    resolvedX = step > 0 ? Math.min(resolvedX, tile.x - body.width) : Math.max(resolvedX, right(tile))
    blocked = true
  })

  if (!blocked) return moved
  return { ...moved, x: resolvedX, vx: 0, hitWall: true }
}

function moveY(
  body: Body,
  step: number,
  map: Tilemap,
  dropThrough: boolean,
  crumbled: TileCoord[],
): Body {
  if (step === 0) return body

  const previousBottom = bottom(boxOf(body))
  const moved: Body = { ...body, y: body.y + step }
  let resolvedY = moved.y
  let landed = false
  let bumped = false

  forEachTile(map, boxOf(moved), (kind, tx, ty) => {
    const tile = tileBounds(map, tx, ty)

    if (isOneWay(kind)) {
      if (!canLandOnOneWay(step, previousBottom, tile, dropThrough)) return
      resolvedY = Math.min(resolvedY, tile.y - body.height)
      landed = true
      return
    }

    if (!isBlocking(kind)) return

    if (step > 0) {
      resolvedY = Math.min(resolvedY, tile.y - body.height)
      landed = true
      if (kind === TILE.crumbling) recordCrumble(crumbled, tx, ty)
    } else {
      resolvedY = Math.max(resolvedY, bottom(tile))
      bumped = true
    }
  })

  if (!landed && !bumped) return moved
  return {
    ...moved,
    y: resolvedY,
    vy: 0,
    onGround: body.onGround || landed,
    hitCeiling: body.hitCeiling || bumped,
  }
}

/**
 * 원웨이 발판은 **하강 중이고 직전에 완전히 위에 있었을 때만** 막는다.
 *
 * 아래에서 뛰어 올라오는 중에 걸리면 그건 버그로 읽힌다.
 */
function canLandOnOneWay(
  step: number,
  previousBottom: number,
  tile: Aabb,
  dropThrough: boolean,
): boolean {
  if (dropThrough) return false
  if (step <= 0) return false
  return previousBottom <= tile.y
}

function recordCrumble(list: TileCoord[], tx: number, ty: number): void {
  if (list.some((c) => c.tx === tx && c.ty === ty)) return
  list.push({ tx, ty })
}

/** 타일 종류를 그대로 노출한다. 엔티티가 위험 타일 판정에 쓴다. */
export type { TileKind }
