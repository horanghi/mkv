import { describe, expect, it } from 'vitest'
import { TILE, tileAt } from '../physics/tilemap.ts'
import { loadBalance } from '../data/load.ts'
import { SECTION_START, STAGE_1 } from '../data/stages/stage1.ts'
import type { EnemyKind } from '../entities/enemies/enemy.ts'
import { DIFFICULTIES, applyDifficultyToStage } from './difficulty.ts'
import type { Stage } from './stage.ts'
import {
  checkpointGapsSeconds,
  joinSections,
  lastCheckpoint,
  loadTiled,
  widthOfSection,
} from './stage.ts'

const player = loadBalance().player

describe('Tiled 로더', () => {
  const tmj = {
    width: 3, height: 2, tilewidth: 16,
    layers: [{ name: 'collision', width: 3, height: 2, data: [0, 1, 2, 3, 4, 0] }],
  }

  it('GID 를 타일 종류로 옮긴다', () => {
    const map = loadTiled(tmj)
    expect(tileAt(map, 0, 0)).toBe(TILE.empty)
    expect(tileAt(map, 1, 0)).toBe(TILE.solid)
    expect(tileAt(map, 2, 0)).toBe(TILE.oneWay)
    expect(tileAt(map, 0, 1)).toBe(TILE.crumbling)
    expect(tileAt(map, 1, 1)).toBe(TILE.hazard)
  })

  it('없는 레이어를 알려준다', () => {
    expect(() => loadTiled(tmj, 'nope')).toThrow(/레이어를 찾을 수 없다/)
  })

  it('크기가 안 맞으면 거부한다 — 조용히 어긋나면 찾을 수 없다', () => {
    const broken = { ...tmj, layers: [{ ...tmj.layers[0]!, data: [0, 1] }] }
    expect(() => loadTiled(broken)).toThrow(/크기가 맞지 않는다/)
  })

  it('모르는 GID 를 거부한다', () => {
    const alien = { ...tmj, layers: [{ ...tmj.layers[0]!, data: [0, 1, 2, 3, 4, 99] }] }
    expect(() => loadTiled(alien)).toThrow(/알 수 없는 GID: 99/)
  })
})

describe('섹션 이어붙이기', () => {
  it('가로로 붙인다', () => {
    expect(joinSections([['ab', 'cd'], ['ef', 'gh']])).toEqual(['abef', 'cdgh'])
  })

  it('높이가 다르면 거부한다', () => {
    expect(() => joinSections([['a'], ['b', 'c']])).toThrow(/높이가/)
  })

  it('빈 목록은 빈 결과다', () => {
    expect(joinSections([])).toEqual([])
  })

  it('폭을 잰다', () => {
    expect(widthOfSection(['abc'])).toBe(3)
    expect(widthOfSection([])).toBe(0)
  })
})

describe('스테이지 1 — 튜토리얼 규칙', () => {
  const map = STAGE_1.map
  const groundRow = map.height - 1

  it('세 섹션이 이어져 있다', () => {
    expect(map.width).toBe(SECTION_START.boss + 44)
    expect(map.height).toBe(17)
  })

  it('1-A 에는 구덩이도 붕괴 타일도 없다 — 여기서는 죽을 수 없다', () => {
    for (let tx = 0; tx < SECTION_START.b; tx += 1) {
      const kind = tileAt(map, tx, groundRow)
      // 첫 점프 구간(2타일)만 예외다
      if (kind === TILE.empty) continue
      expect(kind).toBe(TILE.solid)
    }
    // 붕괴 타일이 하나도 없다
    for (let tx = 0; tx < SECTION_START.b; tx += 1) {
      for (let ty = 0; ty < map.height; ty += 1) {
        expect(tileAt(map, tx, ty)).not.toBe(TILE.crumbling)
      }
    }
  })

  it('1-A 의 첫 점프가 실측 통과 간격 안에 있다', () => {
    // 실측 최대 3타일. 처음 뛰는 사람에게는 그보다 좁아야 한다.
    let widest = 0
    let run = 0
    for (let tx = 0; tx < SECTION_START.b; tx += 1) {
      if (tileAt(map, tx, groundRow) === TILE.empty) run += 1
      else { widest = Math.max(widest, run); run = 0 }
    }
    expect(widest).toBeGreaterThan(0)
    expect(widest).toBeLessThanOrEqual(2)
  })

  it('어떤 구덩이도 3타일을 넘지 않는다 — 넘을 수 없는 간격은 없다', () => {
    let run = 0
    for (let tx = 0; tx < map.width; tx += 1) {
      if (tileAt(map, tx, groundRow) === TILE.empty) {
        run += 1
        expect(run).toBeLessThanOrEqual(3)
      } else run = 0
    }
  })

  it('1-B 에 붕괴 타일이 있다', () => {
    let crumbling = 0
    for (let tx = SECTION_START.b; tx < SECTION_START.boss; tx += 1) {
      for (let ty = 0; ty < map.height; ty += 1) {
        if (tileAt(map, tx, ty) === TILE.crumbling) crumbling += 1
      }
    }
    expect(crumbling).toBeGreaterThan(0)
  })

  it('보스룸 오른쪽이 막혀 있다 — 앞으로는 도망칠 수 없다', () => {
    for (let ty = 0; ty < map.height - 1; ty += 1) {
      expect(tileAt(map, map.width - 1, ty)).toBe(TILE.solid)
    }
  })

  it('보스룸 왼쪽은 열려 있다 — 막으면 들어갈 수도 없다', () => {
    const left = SECTION_START.boss
    for (let ty = 0; ty < map.height - 1; ty += 1) {
      expect(tileAt(map, left, ty)).toBe(TILE.empty)
    }
  })

  it('보스룸 바닥이 평평하다 — 지형이 패턴 읽기를 방해하면 안 된다', () => {
    for (let tx = SECTION_START.boss; tx < map.width; tx += 1) {
      expect(tileAt(map, tx, map.height - 1)).toBe(TILE.solid)
    }
  })
})

describe('체크포인트', () => {
  it('스테이지당 2개다', () => {
    expect(STAGE_1.checkpoints).toHaveLength(2)
  })

  it('사이 간격이 90초를 넘지 않는다', () => {
    // 달리기만 해서 닿는 시간이다. 실제로는 적과 지형 때문에 더 걸린다.
    for (const gap of checkpointGapsSeconds(STAGE_1, player.runSpeed)) {
      expect(gap).toBeLessThanOrEqual(90)
    }
  })

  it('마지막 체크포인트는 보스 직전이다', () => {
    const last = STAGE_1.checkpoints.at(-1)!
    expect(last.tx * 16).toBeLessThan(STAGE_1.bossGateX)
    expect(last.label).toContain('보스')
  })

  it('지나온 체크포인트를 찾는다', () => {
    expect(lastCheckpoint(STAGE_1, 0)).toBeNull()
    const mid = STAGE_1.checkpoints[0]!
    expect(lastCheckpoint(STAGE_1, mid.tx * 16 + 10)?.label).toBe(mid.label)
    expect(lastCheckpoint(STAGE_1, 99999)?.label).toBe(STAGE_1.checkpoints.at(-1)!.label)
  })
})

/** 구덩이가 끝나고 다시 땅이 시작되는 타일들. 뛰어서 닿는 자리다. */
function landingTiles(stage: Stage): readonly number[] {
  const groundRow = stage.map.height - 1
  const landings: number[] = []
  let inGap = false
  for (let tx = 0; tx < stage.map.width; tx += 1) {
    const empty = tileAt(stage.map, tx, groundRow) === TILE.empty
    if (empty) inGap = true
    else if (inGap) { landings.push(tx); inGap = false }
  }
  return landings
}

describe('적 배치', () => {
  it('1-A 는 좀비 3마리뿐이다 — docs/04 구성 그대로', () => {
    const inA = STAGE_1.enemies.filter((e) => e.tx < SECTION_START.b)
    expect(inA).toHaveLength(3)
    expect(inA.every((e) => e.kind === 'ghoul')).toBe(true)
  })

  it('첫 점프 착지 지점 근처에 적이 없다 — 뛴 직후는 회피할 수 없다', () => {
    // 고정 점프 궤도라 공중에서는 궤도를 바꿀 수 없다.
    const groundRow = STAGE_1.map.height - 1
    const gapEnds: number[] = []
    let inGap = false
    for (let tx = 0; tx < SECTION_START.b; tx += 1) {
      const empty = tileAt(STAGE_1.map, tx, groundRow) === TILE.empty
      if (empty) inGap = true
      else if (inGap) { gapEnds.push(tx); inGap = false }
    }
    for (const landing of gapEnds) {
      const near = STAGE_1.enemies.filter((e) => Math.abs(e.tx - landing) <= 3)
      expect(near).toEqual([])
    }
  })

  it('모든 구간에서 지상 적이 착지점을 3타일 이상 비운다', () => {
    // 위 규칙은 이름 그대로 **첫 점프**만 본다. 하지만 "뛴 직후에는 궤도를
    // 바꿀 수 없다"는 것은 물리라서 튜토리얼에서만 성립하지 않는다.
    //
    // 난이도까지 함께 본다. 성기사는 "검증된 자리 옆"에 적을 더 세우는데,
    // 그 옆이 착지점이면 어려운 게 아니라 부당해진다. 게이트는 기사에서만
    // 재므로 여기서 안 잡으면 아무도 모른 채 M2 로 실려 간다.
    //
    // 나는 적은 뺀다 — 대기 상태로 놓여 화면에 먼저 보이고 나서 움직인다.
    const FLYERS: readonly EnemyKind[] = ['grimm', 'corvid']

    for (const id of DIFFICULTIES) {
      const stage = applyDifficultyToStage(STAGE_1, id)
      for (const landing of landingTiles(stage)) {
        const tooClose = stage.enemies.filter(
          (e) => !FLYERS.includes(e.kind) && Math.abs(e.tx - landing) < 3,
        )
        expect({ 난이도: id, 착지: landing, 너무가까운적: tooClose }).toEqual({
          난이도: id, 착지: landing, 너무가까운적: [],
        })
      }
    }
  })

  it('그림은 전부 대기 상태로 배치된다 — 화면 안에서 먼저 보여야 한다', () => {
    const grimms = STAGE_1.enemies.filter((e) => e.kind === 'grimm')
    expect(grimms.length).toBeGreaterThan(0)
    for (const g of grimms) expect(g.state).toBe('dormant')
  })

  it('1-B 입구에 좀비가 있다 — 일부러 한 대 맞게 두는 자리', () => {
    const atEntrance = STAGE_1.enemies.filter(
      (e) => e.kind === 'ghoul' && e.tx >= SECTION_START.b && e.tx <= SECTION_START.b + 8,
    )
    expect(atEntrance.length).toBeGreaterThanOrEqual(2)
  })

  it('적이 전부 맵 안에 있다', () => {
    for (const e of STAGE_1.enemies) {
      expect(e.tx).toBeGreaterThanOrEqual(0)
      expect(e.tx).toBeLessThan(STAGE_1.map.width)
      expect(e.ty).toBeGreaterThanOrEqual(0)
      expect(e.ty).toBeLessThan(STAGE_1.map.height)
    }
  })

  it('보스룸에는 잡몹을 두지 않는다 — 패턴을 읽는 것이 전부다', () => {
    expect(STAGE_1.enemies.filter((e) => e.tx >= SECTION_START.boss)).toEqual([])
  })
})
