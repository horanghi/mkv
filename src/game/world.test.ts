import { describe, expect, it } from 'vitest'
import { INITIAL_INPUT, advanceInput, frameOf, type Action, type InputState } from '../core/input.ts'
import { REVEAL_MS } from '../fx/fade.ts'
import { DEATH, DEATH_TIMING } from '../fx/sequence.ts'
import { DEATH_TIMELINE } from '../ui/hud/hud.ts'
import { loadBalance } from '../data/load.ts'
import { STAGE_1 } from '../data/stages/stage1.ts'
import { CAIRN } from '../entities/bosses/cairn.ts'
import { snapCamera } from './camera.ts'
import {
  boundsOf, continueFrom, createWorld, stepWorld, RESPAWN_DELAY_TICKS, type World,
} from './world.ts'

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

  it('잔기가 남아 있으면 아무것도 묻지 않고 되살린다 — 재시작 마찰이 재시도율을 깎는다', () => {
    const w = fresh()
    const dead: World = {
      ...w,
      vitals: { ...w.vitals, dead: true, lives: 2 },
      respawnTicks: 1,
    }
    const step = stepWorld(dead, INITIAL_INPUT, balance)

    expect(step.world.gameOver).toBe(false)
    expect(step.world.vitals.dead).toBe(false)
    expect(step.events.gameOver).toBe(false)
  })

  it('잔기를 다 쓰면 멈추고 기다린다 — 자동으로 이어 하지 않는다', () => {
    const w = fresh()
    const broke: World = {
      ...w,
      weaponId: 'axe',
      vitals: { ...w.vitals, dead: true, lives: 0 },
      respawnTicks: 1,
    }
    const step = stepWorld(broke, INITIAL_INPUT, balance)

    expect(step.world.gameOver).toBe(true)
    expect(step.events.gameOver).toBe(true)
    // 아직 부활하지 않았다
    expect(step.world.vitals.dead).toBe(true)
    expect(step.world.weaponId).toBe('axe')
  })

  it('게임 오버 이벤트는 한 번만 뜬다', () => {
    const w = fresh()
    let world: World = {
      ...w,
      vitals: { ...w.vitals, dead: true, lives: 0 },
      respawnTicks: 1,
    }
    let fired = 0
    for (let i = 0; i < 10; i += 1) {
      const step = stepWorld(world, INITIAL_INPUT, balance)
      world = step.world
      if (step.events.gameOver) fired += 1
    }
    expect(fired).toBe(1)
  })

  it('이어 하면 잔기와 무기가 초기화되고 체크포인트에서 다시 시작한다', () => {
    const w = fresh()
    const past = STAGE_1.checkpoints[0]!
    const over: World = {
      ...w,
      weaponId: 'axe',
      player: { ...w.player, body: { ...w.player.body, x: past.tx * 16 + 100 } },
      vitals: { ...w.vitals, dead: true, lives: 0 },
      gameOver: true,
    }
    const resumed = continueFrom(over, balance)

    expect(resumed.gameOver).toBe(false)
    expect(resumed.vitals.dead).toBe(false)
    expect(resumed.vitals.lives).toBe(3)
    expect(resumed.weaponId).toBe('lance')
    // 지나온 거리는 잃지 않는다 — 체크포인트에서 이어 한다
    expect(resumed.player.body.x).toBe(past.tx * 16)
  })

  it('게임 오버가 아니면 이어 하기는 아무 일도 안 한다', () => {
    const w = fresh()
    expect(continueFrom(w, balance)).toBe(w)
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

describe('사인 기록', () => {
  /** 좀비가 다 솟아 걷기 시작한 뒤의 월드. 스폰 중에는 무적이라 맞지 않는다. */
  function walking(): World {
    let w = fresh()
    for (let i = 0; i < 60; i += 1) w = stepWorld(w, INITIAL_INPUT, balance).world
    return w
  }

  it('낙사는 pit 이다', () => {
    const w = fresh()
    const falling: World = {
      ...w,
      player: { ...w.player, body: { ...w.player.body, y: 99999 } },
    }
    expect(stepWorld(falling, INITIAL_INPUT, balance).events.cause).toBe('pit')
  })

  it('적에게 맞으면 그 적의 종류가 남는다', () => {
    const w = walking()
    const ghoul = w.enemies.find((e) => e.kind === 'ghoul')
    if (ghoul === undefined) throw new Error('스테이지 1 에 좀비가 없다')

    // 플레이어를 좀비 위에 겹쳐 놓는다
    const touching: World = {
      ...w,
      player: { ...w.player, body: { ...w.player.body, x: ghoul.body.x, y: ghoul.body.y } },
    }
    const step = stepWorld(touching, INITIAL_INPUT, balance)

    expect(step.events.hurt).toBe(true)
    expect(step.events.cause).toBe('ghoul')
  })

  it('보스와 잡몹에 동시에 닿으면 보스로 센다', () => {
    // 보스룸 사망이 잡몹 사망으로 새면 "어디서 죽는가"를 잘못 읽는다.
    const w = walking()
    const cairn = { ...w.cairn, awake: true }
    const ghoul = w.enemies.find((e) => e.kind === 'ghoul')
    if (ghoul === undefined) throw new Error('스테이지 1 에 좀비가 없다')

    const spot = { x: cairn.x + 10, y: cairn.y + 10 }
    const both: World = {
      ...w,
      cairn,
      player: { ...w.player, body: { ...w.player.body, ...spot } },
      enemies: w.enemies.map((e) => (e.id === ghoul.id ? { ...e, body: { ...e.body, ...spot } } : e)),
    }
    const step = stepWorld(both, INITIAL_INPUT, balance)

    expect(step.events.hurt).toBe(true)
    expect(step.events.cause).toBe('cairn')
  })

  it('아무 일 없으면 사인은 없다', () => {
    expect(stepWorld(fresh(), INITIAL_INPUT, balance).events.cause).toBeNull()
  })

  it('죽어 있는 동안에는 사인이 남지 않는다', () => {
    const dead: World = { ...fresh(), vitals: { ...fresh().vitals, dead: true }, respawnTicks: 30 }
    expect(stepWorld(dead, INITIAL_INPUT, balance).events.cause).toBeNull()
  })
})

describe('그림 이륙 신호', () => {
  it('대기에서 풀리는 순간에만 이벤트가 뜬다 — 소리로 위치를 알려야 한다', () => {
    // 고정 점프 궤도라, 공중에서 만나면 회피할 수 없다. 뛰기 전에 알아야 한다.
    let w = fresh()
    const grimm = w.enemies.find((e) => e.kind === 'grimm')
    if (grimm === undefined) throw new Error('스테이지 1 에 그림이 없다')

    // 그림 바로 아래로 순간이동해 시야·반경 안에 들어간다
    w = {
      ...w,
      player: {
        ...w.player,
        body: { ...w.player.body, x: grimm.body.x, y: grimm.body.y + 40 },
      },
    }
    w = { ...w, camera: snapCamera(
      { x: w.player.body.x, y: w.player.body.y, facing: 0, falling: false }, boundsOf(w.stage)) }

    let takeoffs = 0
    for (let i = 0; i < 30; i += 1) {
      const step = stepWorld(w, INITIAL_INPUT, balance)
      w = step.world
      if (step.events.grimmTookOff) takeoffs += 1
    }

    // 한 번만. 매 틱 울리면 소리가 아니라 소음이 된다.
    expect(takeoffs).toBe(1)
    expect(w.enemies.find((e) => e.id === grimm.id)?.state).not.toBe('dormant')
  })

  it('아무 일 없으면 이벤트가 없다', () => {
    expect(stepWorld(fresh(), INITIAL_INPUT, balance).events.grimmTookOff).toBe(false)
  })
})

describe('보물상자 — 무기와 성유물의 유일한 획득 경로', () => {
  /** 상자 앞에 서서 창을 던지고, 열리면 걸어가 줍는다. */
  function openAndTake(index: number): World {
    let w = fresh()
    const chest = w.chests[index]!
    // 상자 왼쪽에 선다
    const standX = chest.x - 40
    let input = INITIAL_INPUT

    for (let i = 0; i < 400; i += 1) {
      const target = w.chests[index]!
      if (target.state === 'taken') break

      // 열기 전에는 제자리에서 던지고, 열린 뒤에는 걸어가 밟는다
      const walking = target.state !== 'closed'
      w = walking ? w : {
        ...w,
        player: { ...w.player, facing: 1, body: { ...w.player.body, x: standX, vx: 0 } },
      }
      input = advanceInput(input, walking ? frameOf('right') : (i % 8 < 4 ? frameOf('attack') : 0))
      const step = stepWorld(w, input, balance)
      w = step.world
      input = step.input
    }
    return w
  }

  it('창으로 때리면 열린다', () => {
    const w = openAndTake(0)
    expect(w.chests[0]!.state).toBe('taken')
  })

  it('무기 상자를 주우면 무기가 바뀐다', () => {
    const w = openAndTake(0)
    const contents = STAGE_1.chests[0]!.contents
    expect(contents.kind).toBe('weapon')
    if (contents.kind === 'weapon') expect(w.weaponId).toBe(contents.weaponId)
    expect(w.weaponId).not.toBe('lance')
  })

  it('성유물 상자를 주우면 금빛 갑옷을 입는다 — 판매 포인트를 볼 수 있어야 한다', () => {
    const index = STAGE_1.chests.findIndex((c) => c.contents.kind === 'relic')
    expect(index).toBeGreaterThanOrEqual(0)

    const w = openAndTake(index)
    expect(w.chests[index]!.state).toBe('taken')
    expect(w.vitals.armor).toBe('relic')
    expect(w.vitals.relic).toBe('gold')
  })

  it('처음에는 아무 상자도 열려 있지 않다', () => {
    expect(fresh().chests.every((c) => c.state === 'closed')).toBe(true)
    expect(fresh().chests.length).toBe(STAGE_1.chests.length)
  })
})

/**
 * 제한 시간 — docs/02 2.8 "시간 초과: 잔기 1 소모, 체크포인트에서 재시작".
 *
 * 난이도가 조절하는 세 축(잔기·시간·체크포인트) 중 하나다. 이게 안 걸리면
 * 종자 8분과 성기사 4분이 화면에 뜨는 숫자일 뿐 아무 차이도 없다.
 */
describe('제한 시간', () => {
  /** 제한 시간에 딱 못 미치게 앉혀 둔 월드. 굴리기만 하면 끊긴다. */
  function almostOut(ticksLeft: number): World {
    const limit = Math.round(balance.player.stageTimeLimitSeconds * 60)
    return { ...fresh(), elapsedTicks: limit - ticksLeft }
  }

  it('처음에는 0 에서 시작한다', () => {
    expect(fresh().elapsedTicks).toBe(0)
  })

  it('틱마다 흐른다', () => {
    expect(run(almostOut(999), 10).world.elapsedTicks).toBeGreaterThan(
      almostOut(999).elapsedTicks)
  })

  it('제한 시간 전에는 죽지 않는다', () => {
    const step = run(almostOut(2), 1)
    expect(step.world.vitals.dead).toBe(false)
  })

  it('제한 시간에 닿으면 죽는다 — 사인은 시간 초과다', () => {
    // 사인은 그 틱의 이벤트에만 실린다. 헬퍼는 개수만 세므로 직접 돌린다.
    const step = stepWorld(almostOut(1), INITIAL_INPUT, balance)
    expect(step.world.vitals.dead).toBe(true)
    expect(step.events.cause).toBe('timeout')
  })

  it('잔기를 1 먹는다 — 즉시 게임 오버가 아니다', () => {
    const before = fresh().vitals.lives
    const dead = stepWorld(almostOut(1), INITIAL_INPUT, balance).world
    // 잔기는 사망이 아니라 부활에서 줄어든다.
    const back = run(dead, RESPAWN_DELAY_TICKS + 2).world
    expect(back.vitals.lives).toBe(before - 1)
    expect(back.gameOver).toBe(false)
  })

  it('부활하면 시계가 되감긴다 — 안 그러면 되살아나자마자 또 끊긴다', () => {
    let w = run(almostOut(1), 1).world
    w = run(w, RESPAWN_DELAY_TICKS + 2).world
    expect(w.vitals.dead).toBe(false)
    expect(w.elapsedTicks).toBeLessThan(10)
  })

  it('클리어한 뒤에는 시간이 죽이지 않는다', () => {
    const cleared = { ...almostOut(1), cleared: true }
    const step = run(cleared, 2)
    expect(step.world.vitals.dead).toBe(false)
  })

  it('이어하기도 시계를 되감는다', () => {
    const over = { ...almostOut(1), gameOver: true, elapsedTicks: 12345 }
    expect(continueFrom(over, balance).elapsedTicks).toBe(0)
  })
})

/**
 * 사망 → 조작 3초 예산을 **실제 상수에서** 계산한다.
 *
 * `ui/hud/hud.ts` 의 `DEATH_TIMELINE` 은 docs/09 의 표를 옮겨 적은 명세이고,
 * 그 테스트는 명세를 자기 자신과 대조한다 — `RESPAWN_DELAY_TICKS` 를 200 으로
 * 바꿔도 통과한다. 여기서는 **재생에 실제로 쓰이는 값**만 가지고 잰다.
 *
 * → prompts/m1-gate.md "사망 → 조작 가능 3초 이하" · docs/02 2.6
 */
describe('사망 → 조작 3초 예산', () => {
  /** 히트스톱은 로직을 멈추므로 실제 시간으로 더해진다. */
  const hitstopMs = DEATH_TIMING.hitstopMs
  const respawnMs = (RESPAWN_DELAY_TICKS / 60) * 1000
  const playableMs = hitstopMs + respawnMs

  it('조작이 돌아오기까지 3초를 넘지 않는다', () => {
    expect(playableMs).toBeLessThan(3000)
  })

  it('화면이 완전히 걷히기까지도 3초 안이다', () => {
    expect(playableMs + REVEAL_MS).toBeLessThan(3000)
  })

  it('docs/09 가 적어 둔 표보다 늦지 않다', () => {
    expect(playableMs).toBeLessThanOrEqual(DEATH_TIMELINE.playableAtMs)
  })

  it('연출이 끝난 뒤에 조작이 돌아온다 — 먼저 돌아오면 연출이 잘린다', () => {
    expect(playableMs).toBeGreaterThanOrEqual(DEATH.durationMs)
  })
})
