import { TILE_SIZE } from '../core/config.ts'
import { bottom, fromEdges, right, type Aabb } from './aabb.ts'

/**
 * 타일 격자와 질의.
 *
 * 경사면은 없다 — 픽셀아트 플랫포머에서 경사면은 버그의 온상이고,
 * 레벨 디자인이 애초에 피한다. → docs/02 2.3, docs/10-tech-spec.md 10.4
 */

export const TILE = {
  empty: 0,
  solid: 1,
  /** 위에서만 밟히는 발판 */
  oneWay: 2,
  /** 밟으면 잠시 뒤 무너지는 타일 */
  crumbling: 3,
  /** 닿으면 즉사. 판정은 엔티티 쪽에서 한다 — 여기서는 통과 가능한 타일이다. */
  hazard: 4,
} as const

export type TileKind = (typeof TILE)[keyof typeof TILE]

export interface Tilemap {
  /** 타일 단위 크기 */
  readonly width: number
  readonly height: number
  readonly tileSize: number
  /** row-major */
  readonly tiles: readonly TileKind[]
}

export interface TileCoord {
  readonly tx: number
  readonly ty: number
}

/** 브로드페이즈 질의 결과. 격자 밖은 잘려 나온다. */
export interface TileRange {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

const ASCII: Readonly<Record<string, TileKind>> = Object.freeze({
  '.': TILE.empty,
  ' ': TILE.empty,
  '#': TILE.solid,
  '-': TILE.oneWay,
  x: TILE.crumbling,
  '^': TILE.hazard,
})

export function createTilemap(
  width: number,
  height: number,
  tiles?: readonly TileKind[],
  tileSize: number = TILE_SIZE,
): Tilemap {
  const size = width * height
  const filled: TileKind[] = new Array<TileKind>(size).fill(TILE.empty)
  if (tiles) {
    for (const [i, kind] of tiles.entries()) {
      if (i >= size) break
      filled[i] = kind
    }
  }
  return { width, height, tileSize, tiles: filled }
}

/**
 * ASCII 로 타일맵을 만든다. 테스트와 그레이박스 레벨용.
 *
 * `.` 빈칸 · `#` 단단함 · `-` 원웨이 · `x` 붕괴 · `^` 위험
 */
export function parseTilemap(rows: readonly string[], tileSize: number = TILE_SIZE): Tilemap {
  const height = rows.length
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const tiles: TileKind[] = new Array<TileKind>(width * height).fill(TILE.empty)

  rows.forEach((row, ty) => {
    let tx = 0
    for (const char of row) {
      const kind = ASCII[char]
      if (kind === undefined) throw new Error(`알 수 없는 타일 문자: "${char}" (${tx}, ${ty})`)
      tiles[ty * width + tx] = kind
      tx += 1
    }
  })

  return { width, height, tileSize, tiles }
}

/**
 * 격자 밖은 전부 빈칸이다.
 *
 * 화면 밖으로 걸어 나가는 것을 물리가 막지 않는다 — 낙사와 스테이지 경계는
 * 게임 규칙이지 충돌 규칙이 아니다. → docs/02 2.5
 */
export function tileAt(map: Tilemap, tx: number, ty: number): TileKind {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return TILE.empty
  return map.tiles[ty * map.width + tx] ?? TILE.empty
}

export function tileAtPoint(map: Tilemap, x: number, y: number): TileKind {
  return tileAt(map, Math.floor(x / map.tileSize), Math.floor(y / map.tileSize))
}

export function setTile(map: Tilemap, tx: number, ty: number, kind: TileKind): Tilemap {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return map
  const tiles = [...map.tiles]
  tiles[ty * map.width + tx] = kind
  return { ...map, tiles }
}

export function tileBounds(map: Tilemap, tx: number, ty: number): Aabb {
  return {
    x: tx * map.tileSize,
    y: ty * map.tileSize,
    width: map.tileSize,
    height: map.tileSize,
  }
}

/**
 * 브로드페이즈 — 상자가 걸치는 타일 범위만 돌려준다.
 *
 * 공간 분할은 넣지 않는다. 동시 엔티티 30 수준에서는 브루트포스가 맞다.
 * 프로파일링이 요구할 때만 도입한다. → docs/10-tech-spec.md 10.4
 */
export function tileRangeFor(map: Tilemap, box: Aabb): TileRange {
  const size = map.tileSize
  // 오른쪽·아래 면이 격자선에 정확히 닿은 경우 그 너머 타일은 포함하지 않는다.
  return {
    minX: Math.max(0, Math.floor(box.x / size)),
    minY: Math.max(0, Math.floor(box.y / size)),
    maxX: Math.min(map.width - 1, Math.ceil(right(box) / size) - 1),
    maxY: Math.min(map.height - 1, Math.ceil(bottom(box) / size) - 1),
  }
}

/** 범위 안의 타일을 순회한다. 빈칸은 건너뛴다. */
export function forEachTile(
  map: Tilemap,
  box: Aabb,
  visit: (kind: TileKind, tx: number, ty: number) => void,
): void {
  const range = tileRangeFor(map, box)
  for (let ty = range.minY; ty <= range.maxY; ty += 1) {
    for (let tx = range.minX; tx <= range.maxX; tx += 1) {
      const kind = tileAt(map, tx, ty)
      if (kind !== TILE.empty) visit(kind, tx, ty)
    }
  }
}

/** 아래에서 위로는 통과하지만 위에서는 밟히는 타일인가. */
export function isOneWay(kind: TileKind): boolean {
  return kind === TILE.oneWay
}

/** 어느 방향에서든 막는 타일인가. 붕괴 타일은 무너지기 전까지 단단하다. */
export function isBlocking(kind: TileKind): boolean {
  return kind === TILE.solid || kind === TILE.crumbling
}

export function tileIndex(map: Tilemap, tx: number, ty: number): number {
  return ty * map.width + tx
}

export function tileFromIndex(map: Tilemap, index: number): TileCoord {
  return { tx: index % map.width, ty: Math.floor(index / map.width) }
}

/** 렌더·디버그용 상자. 그레이박스 레벨을 그릴 때 쓴다. */
export function mapBounds(map: Tilemap): Aabb {
  return fromEdges(0, 0, map.width * map.tileSize, map.height * map.tileSize)
}
