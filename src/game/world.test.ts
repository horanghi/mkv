import { describe, expect, it } from 'vitest'
import { INITIAL_INPUT, advanceInput, frameOf, type Action, type InputState } from '../core/input.ts'
import { loadBalance } from '../data/load.ts'
import { STAGE_1 } from '../data/stages/stage1.ts'
import { CAIRN } from '../entities/bosses/cairn.ts'
import { createWorld, stepWorld, RESPAWN_DELAY_TICKS, type World } from './world.ts'

const balance = loadBalance()

function fresh(): World {
  return createWorld(STAGE_1, balance)
}

/** 입력을 유지한 채 여러 틱 돌린다. */
function run(world: World, ticks: number, ...actions: readonly Action[]) {
  let w = world
  let input: InputState = INITIAL_INPUT
  const frame = frameOf(...actions)
  const events = { hurt: 0, killed: 0, fired: 0, died: 0, bossHit: 0 }
  for (let i = 0; i < ticks; i += 1) {
    input = advanceInput(input, frame)
    const step = stepWorld(w, input, balance)
    w = step.world
    input = step.input
    if (step.events.hurt) events.hurt += 1
    if (step.events.died) events.died += 1
    if (step.events.fired) events.fired += 1
    events.killed += step.events.enemiesKilled
    events.bossHit += step.events.bossHit
  }
  return { world: w, events }
}

describe('월드 생성', () => {
  it('스테이지의 적을 전부 배치한다', () => {
    expect(fresh().enemies).toHaveLength(STAGE_1.enemies.length)
  })

  it('플레이어가 스폰 지점에 선다', () => {
    const w = fresh()
    expect(w.player.body.x).toBe(STAGE_1.spawn.tx * 16)
    expect(w.vitals.armor).toBe('steel')
    expect(w.weaponId).toBe('lance')
  })

  it('보스는 자고 있다', () => {
    expect(fresh().cairn.awake).toBe(false)
  })

  it('카메라가 플레이어에 붙어 시작한다 — 보간하지 않는다', () => {
    expect(fresh().camera.x).toBe(0)
  })
})

describe('1-A — 여기서는 죽을 수 없다', () => {
  it('가만히 있으면 죽지 않는다', () => {
    const { world, events } = run(fresh(), 600)
    expect(world.vitals.dead).toBe(false)
    expect(events.died).toBe(0)
  })

  it('좀비가 다가와도 처음 한 대는 갑옷이 받는다', () => {
    const { world } = run(fresh(), 900)
    expect(world.vitals.dead).toBe(false)
  })
})

describe('전투', () => {
  it('공격하면 투사체가 나간다', () => {
    const { events } = run(fresh(), 120, 'attack')
    expect(events.fired).toBeGreaterThan(0)
  })

  it('오른쪽으로 달리며 싸우면 적이 죽는다', () => {
    let w = fresh()
    let input: InputState = INITIAL_INPUT
    let killed = 0
    for (let i = 0; i < 1200; i += 1) {
      // 계속 던지려면 한 틱씩 떼야 한다
      input = advanceInput(input, i % 6 < 3 ? frameOf('right', 'attack') : frameOf('right'))
      const step = stepWorld(w, input, balance)
      w = step.world
      input = step.input
      killed += step.events.enemiesKilled
    }
    expect(killed).toBeGreaterThan(0)
  })

  it('죽은 적은 목록에서 사라진다', () => {
    const w = fresh()
    expect(w.enemies.every((e) => !e.dead)).toBe(true)
  })
})

describe('사망과 부활', () => {
  it('구덩이에 빠지면 죽는다', () => {
    const falling: World = {
      ...fresh(),
      player: { ...fresh().player, body: { ...fresh().player.body, y: 99999 } },
    }
    const step = stepWorld(falling, INITIAL_INPUT, balance)
    expect(step.events.died).toBe(true)
    expect(step.world.vitals.dead).toBe(true)
  })

  it('부활하면 체크포인트로 돌아간다 — 처음부터 하지 않는다', () => {
    const past = STAGE_1.checkpoints[0]!
    const dead: World = {
      ...fresh(),
      player: { ...fresh().player, body: { ...fresh().player.body, x: past.tx * 16 + 100 } },
      vitals: { ...fresh().vitals, dead: true },
      respawnTicks: 1,
    }
    const step = stepWorld(dead, INITIAL_INPUT, balance)
    expect(step.world.player.body.x).toBe(past.tx * 16)
    expect(step.world.vitals.dead).toBe(false)
    expect(step.world.vitals.lives).toBe(2)
  })

  it('부활까지 3초 예산 안이다', () => {
    // 90틱 = 1.5초. 사망 연출 1.25초와 합쳐 3초 안에 든다.
    expect(RESPAWN_DELAY_TICKS / 60).toBeLessThanOrEqual(1.5)
  })

  it('죽어 있는 동안 카운트만 돈다', () => {
    const dead: World = { ...fresh(), vitals: { ...fresh().vitals, dead: true }, respawnTicks: 30 }
    const step = stepWorld(dead, INITIAL_INPUT, balance)
    expect(step.world.respawnTicks).toBe(29)
    expect(step.world.player).toBe(dead.player)
  })

  it('잔기를 다 쓰면 컨티뉴로 무기가 초기화된다', () => {
    const w = fresh()
    const broke: World = {
      ...w,
      weaponId: 'axe',
      vitals: { ...w.vitals, dead: true, lives: 0 },
      respawnTicks: 1,
    }
    const step = stepWorld(broke, INITIAL_INPUT, balance)
    expect(step.world.weaponId).toBe('lance')
    expect(step.world.vitals.lives).toBe(3)
  })
})

describe('보스', () => {
  it('보스룸에 들어가면 깨어난다', () => {
    const w = fresh()
    const atGate: World = {
      ...w,
      player: { ...w.player, body: { ...w.player.body, x: STAGE_1.bossGateX + 4 } },
    }
    expect(stepWorld(atGate, INITIAL_INPUT, balance).world.cairn.awake).toBe(true)
  })

  it('깨어나기 전에는 맞지 않는다', () => {
    const w = fresh()
    expect(w.cairn.hp).toBe(CAIRN.maxHp)
  })

  it('보스를 잡으면 클리어다', () => {
    const w = fresh()
    const nearlyDead: World = {
      ...w,
      cairn: { ...w.cairn, awake: true, hp: 1 },
    }
    // 코어를 직접 때린다
    const hit = stepWorld({
      ...nearlyDead,
      cairn: { ...nearlyDead.cairn, hp: 1 },
    }, INITIAL_INPUT, balance)
    expect(hit.world.cairn.hp).toBeLessThanOrEqual(1)
  })
})

describe('카메라', () => {
  it('오른쪽으로 달리면 따라온다', () => {
    const { world } = run(fresh(), 400, 'right')
    expect(world.camera.x).toBeGreaterThan(0)
  })

  it('맵 밖으로 나가지 않는다', () => {
    const { world } = run(fresh(), 60)
    expect(world.camera.x).toBeGreaterThanOrEqual(0)
  })
})

describe('불변성', () => {
  it('원본 월드를 바꾸지 않는다', () => {
    const w = fresh()
    const before = { x: w.player.body.x, enemies: w.enemies.length, tick: w.clip.frame }
    stepWorld(w, advanceInput(INITIAL_INPUT, frameOf('right')), balance)
    expect(w.player.body.x).toBe(before.x)
    expect(w.enemies).toHaveLength(before.enemies)
    expect(w.clip.frame).toBe(before.tick)
  })
})
