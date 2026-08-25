import { describe, expect, it } from 'vitest'
import { sectionAt } from '../../game/stage.ts'
import { TILE, tileAt, type TileKind } from '../../physics/tilemap.ts'
import { SECTION_START, STAGE_1 } from './stage1.ts'

/**
 * 스테이지 1 의 배치 규칙.
 *
 * `docs/04-level-design.md` 가 정한 것을 데이터에서 직접 검사한다.
 * 이 규칙들은 취향이 아니라 **공정성**이다 — 고정 점프 궤도라 공중에서는
 * 궤도를 바꿀 수 없으므로, 착지 지점의 적이나 궤도 위의 블록은
 * 회피 불가능한 피해가 된다.
 *
 * m1-gate 의 1순위 지표가 재시도율이고, 미달이면 "어려운 게 아니라 불공정한 것"
 * 이라고 못박혀 있다. 불공정을 데이터에서 미리 걸러 낸다.
 */

const MAP = STAGE_1.map
const GROUND_ROW = MAP.height - 1
const SIZE = MAP.tileSize

/** 지면 행의 구덩이. [시작 타일, 길이] */
function groundGaps(): readonly { readonly start: number; readonly length: number }[] {
  const gaps: { start: number; length: number }[] = []
  let run = 0
  for (let tx = 0; tx < MAP.width; tx += 1) {
    if (tileAt(MAP, tx, GROUND_ROW) === TILE.empty) {
      run += 1
    } else if (run > 0) {
      gaps.push({ start: tx - run, length: run })
      run = 0
    }
  }
  if (run > 0) gaps.push({ start: MAP.width - run, length: run })
  return gaps
}

describe('스테이지 1 배치 규칙 — docs/04', () => {
  it('구덩이가 하나 이상 있다 — 없으면 이 검사가 무의미하다', () => {
    expect(groundGaps().length).toBeGreaterThan(0)
  })

  it('어떤 구덩이도 3타일을 넘지 않는다 — 실측 통과 한계', () => {
    for (const gap of groundGaps()) {
      expect([gap.start, gap.length]).toEqual([gap.start, Math.min(gap.length, 3)])
    }
  })

  it('구덩이를 건너는 구간의 머리 위 4타일에 막는 지형이 없다 — 궤도에 걸리면 회피 불가다', () => {
    // 도약 타일부터 착지 타일까지, 지면 위 4행.
    //
    // **원웨이는 뺀다.** 아래에서는 통과하므로 상승하는 점프를 막지 않는다.
    // docs/04 의 규칙이 막으려는 것은 "궤도 높이에 걸려 점프가 끊기는 것"이다.
    const BLOCKS_JUMP: readonly TileKind[] = [TILE.solid, TILE.crumbling, TILE.hazard]
    for (const gap of groundGaps()) {
      const from = Math.max(0, gap.start - 1)
      const to = Math.min(MAP.width - 1, gap.start + gap.length)
      for (let tx = from; tx <= to; tx += 1) {
        for (let up = 1; up <= 4; up += 1) {
          const kind = tileAt(MAP, tx, GROUND_ROW - up)
          const blocks = BLOCKS_JUMP.includes(kind)
          expect([tx, GROUND_ROW - up, blocks]).toEqual([tx, GROUND_ROW - up, false])
        }
      }
    }
  })

  it('구덩이 착지 지점 3타일 안에 지상 적이 없다 — 착지 순간은 회피할 수 없다', () => {
    // **공중 적은 뺀다.** 그림이 점프 근처에 있는 것은 의도된 설계다 —
    // "공중에서 만나면 회피할 수 없으므로 뛰기 전에 반드시 위치를 확인하게 된다"
    // (docs/12 12.8). 대기 상태로 먼저 보이는 것이 그 공정성 장치다.
    // 여기서 막으려는 것은 착지 타일을 **점유한** 지상 적이다.
    const GROUND_BAND = 2
    const landings = groundGaps().map((gap) => gap.start + gap.length)

    for (const landing of landings) {
      for (const enemy of STAGE_1.enemies) {
        if (GROUND_ROW - enemy.ty > GROUND_BAND) continue
        const distance = enemy.tx - landing
        // 착지 지점 앞 3타일. 뒤쪽(도약 전)은 걸어가며 볼 수 있으므로 제외한다.
        const inLandingZone = distance >= 0 && distance < 3
        expect([enemy.kind, enemy.tx, landing, inLandingZone])
          .toEqual([enemy.kind, enemy.tx, landing, false])
      }
    }
  })

  it('1-A 에는 붕괴 타일도 가시도 없다 — 배우는 구간이다', () => {
    for (let tx = SECTION_START.a; tx < SECTION_START.b; tx += 1) {
      for (let ty = 0; ty < MAP.height; ty += 1) {
        const kind = tileAt(MAP, tx, ty)
        expect([tx, ty, kind === TILE.crumbling || kind === TILE.hazard])
          .toEqual([tx, ty, false])
      }
    }
  })

  it('1-A 의 구덩이는 첫 점프 하나뿐이고, 통과 한계보다 좁다', () => {
    // 실측 통과 한계는 3타일이다. 처음 뛰는 사람이 한계폭에서 실패하면
    // 가르치는 게 아니라 벌주는 것이다. → 모듈 주석
    const inA = groundGaps().filter((gap) => gap.start < SECTION_START.b)
    expect(inA).toHaveLength(1)
    expect(inA[0]!.length).toBe(2)
  })

  it('1-A 에는 좀비만 있다', () => {
    const inA = STAGE_1.enemies.filter((e) => e.tx < SECTION_START.b)
    expect(inA.length).toBeGreaterThan(0)
    expect(inA.every((e) => e.kind === 'ghoul')).toBe(true)
  })

  it('보스룸은 오른쪽만 막힌다 — 양쪽을 막으면 들어갈 수도 없다', () => {
    const entry = SECTION_START.boss
    // 진입 지점의 사람 키(2타일)만큼이 비어 있어야 걸어 들어간다
    expect(tileAt(MAP, entry, GROUND_ROW - 1)).toBe(TILE.empty)
    expect(tileAt(MAP, entry, GROUND_ROW - 2)).toBe(TILE.empty)
    // 오른쪽 끝은 막혀 있다
    expect(tileAt(MAP, MAP.width - 1, GROUND_ROW - 1)).toBe(TILE.solid)
  })

  it('체크포인트가 구간을 나눈다 — 죽어도 처음부터 하지 않는다', () => {
    expect(STAGE_1.checkpoints.length).toBeGreaterThanOrEqual(2)
    for (const cp of STAGE_1.checkpoints) {
      expect(tileAt(MAP, cp.tx, GROUND_ROW)).toBe(TILE.solid)
      // 체크포인트 자리에 서 있을 공간이 있어야 한다
      expect(tileAt(MAP, cp.tx, cp.ty)).toBe(TILE.empty)
    }
  })

  it('구간 경계가 실제 섹션과 맞는다 — 노히트 보너스가 여기서 계산된다', () => {
    expect(STAGE_1.sections).toEqual([SECTION_START.a, SECTION_START.b, SECTION_START.boss])
    expect(sectionAt(STAGE_1, 0)).toBe(0)
    expect(sectionAt(STAGE_1, SECTION_START.b * SIZE)).toBe(1)
    expect(sectionAt(STAGE_1, SECTION_START.boss * SIZE)).toBe(2)
  })

  it('보스 게이트가 보스룸 안에 있다', () => {
    expect(STAGE_1.bossGateX).toBeGreaterThan(SECTION_START.boss * SIZE)
    expect(STAGE_1.bossGateX).toBeLessThan(MAP.width * SIZE)
  })
})

describe('보물상자 배치 — docs/04 4.4', () => {
  it('무기 상자가 3~4개다', () => {
    const weapons = STAGE_1.chests.filter((c) => c.contents.kind === 'weapon')
    expect(weapons.length).toBeGreaterThanOrEqual(3)
    expect(weapons.length).toBeLessThanOrEqual(4)
  })

  it('성유물 상자는 스테이지당 하나다', () => {
    expect(STAGE_1.chests.filter((c) => c.contents.kind === 'relic')).toHaveLength(1)
  })

  it('성유물은 보스룸 전에 반드시 지나는 자리에 있다', () => {
    // 갑옷 파괴 연출이 판매 포인트인데, 성유물 → 강철 → 속옷 세 단계를
    // 못 보면 그 연출의 절반만 보는 것이다. → docs/06 6.3
    const relic = STAGE_1.chests.find((c) => c.contents.kind === 'relic')!
    expect(relic.tx).toBeLessThan(SECTION_START.boss)
    expect(relic.tx).toBeGreaterThan(SECTION_START.b)
  })

  it('상자가 지면 위에 놓인다 — 공중에 뜨거나 벽에 박히지 않는다', () => {
    for (const chest of STAGE_1.chests) {
      expect([chest.tx, tileAt(MAP, chest.tx, chest.ty + 1)]).toEqual([chest.tx, TILE.solid])
      expect([chest.tx, tileAt(MAP, chest.tx, chest.ty)]).toEqual([chest.tx, TILE.empty])
    }
  })

  it('구덩이 착지 지점에 상자를 두지 않는다 — 착지 순간에 열 수 없다', () => {
    const landings = groundGaps().map((gap) => gap.start + gap.length)
    for (const chest of STAGE_1.chests) {
      for (const landing of landings) {
        const distance = chest.tx - landing
        expect([chest.tx, landing, distance >= 0 && distance < 3])
          .toEqual([chest.tx, landing, false])
      }
    }
  })

  it('첫 무기 상자가 1-A 안에 있다 — 죽을 수 없는 구간에서 바꿔 본다', () => {
    const first = [...STAGE_1.chests].sort((a, b) => a.tx - b.tx)[0]!
    expect(first.tx).toBeLessThan(SECTION_START.b)
    expect(first.contents.kind).toBe('weapon')
  })
})
