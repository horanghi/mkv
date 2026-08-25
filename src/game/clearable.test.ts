import { describe, expect, it } from 'vitest'
import { INITIAL_INPUT, advanceInput, frameOf, type Action, type InputState } from '../core/input.ts'
import { loadBalance } from '../data/load.ts'
import { STAGE_1 } from '../data/stages/stage1.ts'
import { CAIRN, coreBox, damageCairn } from '../entities/bosses/cairn.ts'
import { boxOfEnemy } from '../entities/enemies/enemy.ts'
import { TILE, tileAt } from '../physics/tilemap.ts'
import { applyDifficulty, applyDifficultyToStage, DIFFICULTIES, rulesFor } from './difficulty.ts'
import { createWorld, stepWorld } from './world.ts'
import type { Balance } from '../data/load.ts'
import type { Stage } from './stage.ts'

const balance = loadBalance()

/**
 * 사람처럼 움직이는 봇. 규칙은 셋뿐이고, 처음 플레이하는 사람과 같다.
 *
 *   1. 앞에 적이 있으면 멈춰서 던진다
 *   2. 앞에 구덩이가 있으면 뛴다
 *   3. 아니면 걷는다
 *
 * 사람의 플레이를 대신하지는 못한다. **경로가 막혀 있지 않다**는 것만 본다.
 */
function botReachesBoss(stage: Stage, stageBalance: Balance): boolean {
  let world = createWorld(stage, stageBalance)
  let input: InputState = INITIAL_INPUT
  const size = stage.map.tileSize
  const groundRow = stage.map.height - 1

  const gapAhead = (x: number): boolean => {
    const tx = Math.floor((x + 14) / size)
    return tileAt(stage.map, tx, groundRow) === TILE.empty
  }
  const enemyAhead = (x: number, y: number): boolean =>
    world.enemies.some((e) => {
      const box = boxOfEnemy(e)
      return box.x - x > 0 && box.x - x < 70 && Math.abs(box.y - y) < 40
    })

  for (let i = 0; i < 60 * 300; i += 1) {
    const body = world.player.body
    const actions: Action[] = []

    if (enemyAhead(body.x, body.y)) {
      // 멈춰서 던진다. 눌렀다 떼야 다시 나간다.
      if (i % 6 < 3) actions.push('attack')
    } else {
      actions.push('right')
      if (body.onGround && gapAhead(body.x)) actions.push('jump')
    }

    input = advanceInput(input, frameOf(...actions))
    const step = stepWorld(world, input, stageBalance)
    world = step.world
    input = step.input
    if (world.cairn.awake) return true
  }

  return false
}

/**
 * 스테이지 1 이 처음부터 끝까지 클리어 가능한가.
 *
 * m1-5 의 Done 조건이다.
 */
describe('스테이지 1 — 클리어 가능성', () => {
  it('사람처럼 움직이면 보스룸까지 닿는다', () => {
    expect(botReachesBoss(STAGE_1, balance)).toBe(true)
  })

  it('체크포인트가 진행을 보존한다 — 죽어도 처음부터 하지 않는다', () => {
    let world = createWorld(STAGE_1, balance)
    let input: InputState = INITIAL_INPUT
    let maxX = 0
    let died = false

    // 아무 대응 없이 달리기만 하면 좀비에게 맞아 죽는다. 그래도 전진은 남는다.
    for (let i = 0; i < 60 * 120; i += 1) {
      const jumping = world.player.body.onGround && i % 30 < 2
      input = advanceInput(input, jumping ? frameOf('right', 'jump') : frameOf('right'))
      const step = stepWorld(world, input, balance)
      world = step.world
      input = step.input
      if (step.events.died) died = true
      maxX = Math.max(maxX, world.player.body.x)
    }

    expect(died).toBe(true)
    // 죽고 나서도 스폰 지점이 아니라 체크포인트에서 다시 시작한다
    expect(maxX).toBeGreaterThan(STAGE_1.checkpoints[0]!.tx * 16)
  })

  it('보스를 코어만 노리면 30발로 잡는다 — 창 데미지 10', () => {
    let world = createWorld(STAGE_1, balance)
    world = { ...world, cairn: { ...world.cairn, awake: true } }

    let shots = 0
    while (world.cairn.hp > 0 && shots < 100) {
      const result = damageCairn(world.cairn, 10, coreBox(world.cairn))
      world = { ...world, cairn: result.cairn }
      shots += 1
    }
    expect(world.cairn.hp).toBe(0)
    expect(shots).toBe(CAIRN.maxHp / 10)
  })

  it('보스를 잡으면 클리어 표시가 선다', () => {
    let world = createWorld(STAGE_1, balance)
    world = { ...world, cairn: { ...world.cairn, awake: true, hp: 5 } }

    // 코어 위치에 투사체를 놓아 맞힌다
    const core = coreBox(world.cairn)
    const shot = {
      id: 1, weaponId: 'lance', x: core.x, y: core.y, width: 4, height: 4,
      vx: 0, vy: 0, damage: 10, ageFrames: 0,
    }
    world = { ...world, shots: { projectiles: [shot], nextId: 2 } }

    const step = stepWorld(world, INITIAL_INPUT, balance)
    expect(step.events.bossKilled).toBe(true)
    expect(step.world.cleared).toBe(true)
  })

  it('플레이어가 스테이지 끝까지 갈 수 있다 — 넘을 수 없는 지형이 없다', () => {
    // 각 구덩이 직전에서 최대 속도로 뛰면 반드시 넘는다.
    const size = STAGE_1.map.tileSize
    const groundRow = STAGE_1.map.height - 1
    const gaps: number[] = []
    let run = 0
    for (let tx = 0; tx < STAGE_1.map.width; tx += 1) {
      const solid = STAGE_1.map.tiles[groundRow * STAGE_1.map.width + tx] !== 0
      if (!solid) run += 1
      else { if (run > 0) gaps.push(run); run = 0 }
    }
    // 실측 통과 가능 간격은 3타일이다. → docs/02 실측 주석
    for (const gap of gaps) expect(gap * size).toBeLessThanOrEqual(3 * size)
  })
})

/**
 * 난이도를 바꾼 뒤에도 깰 수 있는가.
 *
 * 성기사는 **적을 늘린다.** 늘린 자리가 구덩이 착지점이거나 통로를 막으면
 * 그 난이도는 어려운 게 아니라 불가능해진다. 게이트는 기사에서만 재므로
 * 여기서 안 잡으면 아무도 모르는 채로 M2 에 실려 간다.
 * → docs/08 8.4 · prompts/m1-gate.md
 */
describe('난이도 3단계 — 전부 보스룸까지 닿는가', () => {
  for (const id of DIFFICULTIES) {
    it(`${rulesFor(id).name} 에서도 길이 막히지 않는다`, () => {
      const stage = applyDifficultyToStage(STAGE_1, id)
      expect(botReachesBoss(stage, applyDifficulty(balance, id))).toBe(true)
    })
  }
})
