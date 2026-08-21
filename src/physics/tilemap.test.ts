import { describe, expect, it } from 'vitest'
import { TILE_SIZE } from '../core/config.ts'
import type { Aabb } from './aabb.ts'
import {
  TILE,
  createTilemap,
  forEachTile,
  isBlocking,
  isOneWay,
  mapBounds,
  parseTilemap,
  setTile,
  tileAt,
  tileAtPoint,
  tileBounds,
  tileFromIndex,
  tileIndex,
  tileRangeFor,
} from './tilemap.ts'

const LEVEL = parseTilemap([
  '....',
  '..^.',
  '.-x.',
  '####',
])

describe('생성', () => {
  it('빈 맵을 만든다', () => {
    const map = createTilemap(3, 2)
    expect(map.tiles).toHaveLength(6)
    expect(map.tiles.every((t) => t === TILE.empty)).toBe(true)
    expect(map.tileSize).toBe(TILE_SIZE)
  })

  it('타일 배열을 받는다', () => {
    const map = createTilemap(2, 1, [TILE.solid, TILE.oneWay])
    expect(tileAt(map, 0, 0)).toBe(TILE.solid)
    expect(tileAt(map, 1, 0)).toBe(TILE.oneWay)
  })

  it('배열이 짧으면 나머지는 빈칸이다', () => {
    const map = createTilemap(2, 2, [TILE.solid])
    expect(tileAt(map, 1, 1)).toBe(TILE.empty)
  })

  it('배열이 길면 잘라낸다', () => {
    const map = createTilemap(1, 1, [TILE.solid, TILE.solid, TILE.solid])
    expect(map.tiles).toHaveLength(1)
  })
})

describe('ASCII 파싱', () => {
  it('문자를 타일로 바꾼다', () => {
    expect(tileAt(LEVEL, 0, 0)).toBe(TILE.empty)
    expect(tileAt(LEVEL, 2, 1)).toBe(TILE.hazard)
    expect(tileAt(LEVEL, 1, 2)).toBe(TILE.oneWay)
    expect(tileAt(LEVEL, 2, 2)).toBe(TILE.crumbling)
    expect(tileAt(LEVEL, 0, 3)).toBe(TILE.solid)
  })

  it('줄 길이가 달라도 가장 긴 줄에 맞춘다', () => {
    const map = parseTilemap(['#', '###'])
    expect(map.width).toBe(3)
    expect(tileAt(map, 2, 0)).toBe(TILE.empty)
  })

  it('공백도 빈칸이다', () => {
    expect(tileAt(parseTilemap([' #']), 0, 0)).toBe(TILE.empty)
  })

  it('모르는 문자는 거부한다', () => {
    expect(() => parseTilemap(['?'])).toThrow(/알 수 없는 타일 문자/)
  })
})

describe('격자 밖', () => {
  it('사방 모두 빈칸이다', () => {
    // 낙사와 스테이지 경계는 게임 규칙이지 충돌 규칙이 아니다.
    expect(tileAt(LEVEL, -1, 0)).toBe(TILE.empty)
    expect(tileAt(LEVEL, 0, -1)).toBe(TILE.empty)
    expect(tileAt(LEVEL, 99, 0)).toBe(TILE.empty)
    expect(tileAt(LEVEL, 0, 99)).toBe(TILE.empty)
  })

  it('밖에 타일을 놓으려 하면 맵이 그대로다', () => {
    expect(setTile(LEVEL, -1, 0, TILE.solid)).toBe(LEVEL)
    expect(setTile(LEVEL, 0, 99, TILE.solid)).toBe(LEVEL)
  })
})

describe('좌표 변환', () => {
  it('픽셀 좌표를 타일로 바꾼다', () => {
    expect(tileAtPoint(LEVEL, 0, 3 * TILE_SIZE)).toBe(TILE.solid)
    expect(tileAtPoint(LEVEL, TILE_SIZE * 2 + 8, TILE_SIZE + 8)).toBe(TILE.hazard)
  })

  it('타일의 픽셀 상자를 준다', () => {
    expect(tileBounds(LEVEL, 2, 3)).toEqual({ x: 32, y: 48, width: 16, height: 16 })
  })

  it('인덱스를 왕복한다', () => {
    const index = tileIndex(LEVEL, 2, 3)
    expect(tileFromIndex(LEVEL, index)).toEqual({ tx: 2, ty: 3 })
  })

  it('맵 전체 상자를 준다', () => {
    expect(mapBounds(LEVEL)).toEqual({ x: 0, y: 0, width: 64, height: 64 })
  })
})

describe('setTile — 불변', () => {
  it('새 맵을 돌려주고 원본을 남긴다', () => {
    const changed = setTile(LEVEL, 0, 0, TILE.solid)
    expect(tileAt(changed, 0, 0)).toBe(TILE.solid)
    expect(tileAt(LEVEL, 0, 0)).toBe(TILE.empty)
  })
})

describe('브로드페이즈 — tileRangeFor', () => {
  const range = (box: Aabb) => tileRangeFor(LEVEL, box)

  it('한 타일 안에 든 상자는 그 타일만 본다', () => {
    expect(range({ x: 2, y: 2, width: 4, height: 4 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    })
  })

  it('타일에 정확히 맞는 상자는 옆 타일을 끌어들이지 않는다', () => {
    expect(range({ x: 0, y: 0, width: 16, height: 16 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    })
  })

  it('경계를 1px 넘으면 옆 타일이 들어온다', () => {
    expect(range({ x: 0, y: 0, width: 17, height: 16 }).maxX).toBe(1)
  })

  it('격자 밖으로 나간 부분은 잘린다', () => {
    expect(range({ x: -100, y: -100, width: 200, height: 200 })).toEqual({
      minX: 0,
      minY: 0,
      maxX: 3,
      maxY: 3,
    })
  })
})

describe('forEachTile', () => {
  it('빈칸은 건너뛴다', () => {
    const seen: number[] = []
    forEachTile(LEVEL, mapBounds(LEVEL), (kind) => seen.push(kind))
    expect(seen).not.toContain(TILE.empty)
    // 위험 1 + 원웨이 1 + 붕괴 1 + 바닥 4
    expect(seen).toHaveLength(7)
  })

  it('걸치는 타일만 방문한다', () => {
    const seen: string[] = []
    forEachTile(LEVEL, { x: 0, y: 48, width: 16, height: 16 }, (_, tx, ty) =>
      seen.push(`${tx},${ty}`),
    )
    expect(seen).toEqual(['0,3'])
  })
})

describe('타일 분류', () => {
  it('원웨이는 원웨이뿐이다', () => {
    expect(isOneWay(TILE.oneWay)).toBe(true)
    expect(isOneWay(TILE.solid)).toBe(false)
  })

  it('붕괴 타일은 무너지기 전까지 단단하다', () => {
    expect(isBlocking(TILE.solid)).toBe(true)
    expect(isBlocking(TILE.crumbling)).toBe(true)
    expect(isBlocking(TILE.oneWay)).toBe(false)
    expect(isBlocking(TILE.hazard)).toBe(false)
    expect(isBlocking(TILE.empty)).toBe(false)
  })
})
