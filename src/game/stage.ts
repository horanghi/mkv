import { TILE, createTilemap, type TileKind, type Tilemap } from '../physics/tilemap.ts'
import type { EnemyKind } from '../entities/enemies/enemy.ts'
import type { ChestContents } from '../entities/pickups/chest.ts'

/**
 * 스테이지 데이터와 로더.
 *
 * 최종 제작은 Tiled(`.tmj`)로 하고, 여기서 우리 타일맵으로 옮긴다.
 * 스테이지 1 은 ASCII 로 직접 쓴다 — 손으로 읽고 고칠 수 있어야 튜토리얼을
 * 반복해서 다듬을 수 있다. → docs/04-stages.md 4.5 · docs/10-tech-spec.md 10.6
 */

export interface EnemySpawn {
  readonly kind: EnemyKind
  /** 타일 좌표 */
  readonly tx: number
  readonly ty: number
  readonly state?: string
  readonly facing?: -1 | 1
}

export interface Checkpoint {
  readonly tx: number
  readonly ty: number
  readonly label: string
}

export interface ChestSpawn {
  readonly tx: number
  readonly ty: number
  readonly contents: ChestContents
}

export interface Stage {
  readonly id: string
  readonly name: string
  readonly map: Tilemap
  readonly spawn: { readonly tx: number; readonly ty: number }
  readonly checkpoints: readonly Checkpoint[]
  readonly enemies: readonly EnemySpawn[]
  /** 보물상자. 때려서 열고 밟아서 줍는다 → docs/04 4.4 */
  readonly chests: readonly ChestSpawn[]
  /**
   * 구간 경계의 타일 x. 첫 값은 0 이다.
   *
   * 노히트 보너스가 **구간당** 붙으므로(docs/02 2.7) 경계가 데이터에 있어야 한다.
   * 레벨을 고치면 여기도 같이 고친다.
   */
  readonly sections: readonly number[]
  /** 보스룸 진입 x (픽셀). 이 지점을 넘으면 보스가 깨어난다. */
  readonly bossGateX: number
}

/**
 * 이 x 픽셀이 몇 번째 구간인가. 경계 밖은 0 또는 마지막 구간이다.
 */
export function sectionAt(stage: Stage, x: number, tileSize = 16): number {
  const tx = x / tileSize
  let index = 0
  for (let i = 0; i < stage.sections.length; i += 1) {
    if (tx >= (stage.sections[i] ?? 0)) index = i
  }
  return index
}

// ── Tiled 로더 ──────────────────────────────────────────────────────────────

export interface TiledLayer {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly data: readonly number[]
}

export interface TiledMap {
  readonly width: number
  readonly height: number
  readonly tilewidth: number
  readonly layers: readonly TiledLayer[]
}

/**
 * Tiled 의 GID 를 우리 타일 종류로 옮긴다.
 *
 * Tiled 는 1부터 센다. 0 은 빈칸이다.
 */
export const TILED_GID: Readonly<Record<number, TileKind>> = {
  0: TILE.empty,
  1: TILE.solid,
  2: TILE.oneWay,
  3: TILE.crumbling,
  4: TILE.hazard,
}

export function loadTiled(tmj: TiledMap, layerName = 'collision'): Tilemap {
  const layer = tmj.layers.find((l) => l.name === layerName)
  if (!layer) throw new Error(`Tiled 레이어를 찾을 수 없다: "${layerName}"`)
  if (layer.data.length !== tmj.width * tmj.height) {
    throw new Error(
      `Tiled 레이어 크기가 맞지 않는다: ${layer.data.length} ≠ ${tmj.width}×${tmj.height}`,
    )
  }

  const tiles = layer.data.map((gid) => {
    const kind = TILED_GID[gid]
    if (kind === undefined) throw new Error(`알 수 없는 GID: ${gid}`)
    return kind
  })
  return createTilemap(tmj.width, tmj.height, tiles, tmj.tilewidth)
}

// ── ASCII 작성 ──────────────────────────────────────────────────────────────

/**
 * 섹션을 가로로 이어 붙인다.
 *
 * 스테이지가 길어지면 한 줄이 수백 글자가 되어 손으로 다룰 수 없다.
 * 섹션 단위로 쪼개면 "1-A 를 3타일 늘린다" 같은 수정이 가능해진다.
 */
export function joinSections(sections: readonly (readonly string[])[]): readonly string[] {
  if (sections.length === 0) return []
  const height = sections[0]?.length ?? 0

  sections.forEach((section, i) => {
    if (section.length !== height) {
      throw new Error(`섹션 ${i} 의 높이가 ${section.length} 다 — ${height} 여야 한다`)
    }
  })

  return Array.from({ length: height }, (_, y) =>
    sections.map((section) => section[y] ?? '').join(''),
  )
}

/** 섹션의 가로 폭(타일). 적 배치 좌표를 계산할 때 쓴다. */
export function widthOfSection(section: readonly string[]): number {
  return section[0]?.length ?? 0
}

/** 체크포인트 사이 간격을 잰다. 90초를 넘으면 안 된다. → docs/04 */
export function checkpointGapsSeconds(
  stage: Stage,
  runSpeed: number,
  tileSize = stage.map.tileSize,
): readonly number[] {
  const marks = [stage.spawn, ...stage.checkpoints]
  const gaps: number[] = []
  for (let i = 1; i < marks.length; i += 1) {
    const dx = Math.abs((marks[i]!.tx - marks[i - 1]!.tx) * tileSize)
    gaps.push(dx / runSpeed)
  }
  return gaps
}

/** 지금 위치에서 마지막으로 지난 체크포인트. */
export function lastCheckpoint(stage: Stage, x: number): Checkpoint | null {
  let found: Checkpoint | null = null
  for (const cp of stage.checkpoints) {
    if (cp.tx * stage.map.tileSize <= x) found = cp
  }
  return found
}
