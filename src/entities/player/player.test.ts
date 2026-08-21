import { describe, expect, it } from 'vitest'
import { TICK_SECONDS, TILE_SIZE } from '../../core/config.ts'
import {
  INITIAL_INPUT,
  advanceInput,
  frameOf,
  type Action,
  type InputState,
} from '../../core/input.ts'
import { loadBalance } from '../../data/load.ts'
import { parseTilemap, type Tilemap } from '../../physics/tilemap.ts'
import { simulateJumpArc } from './arc.ts'
import { createPlayer, stepPlayer, type Player } from './player.ts'

const balance = loadBalance().player
const dt = TICK_SECONDS

/** 평지. 지면 상단 y=80. */
const FLAT: Tilemap = parseTilemap([
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '##############################',
])

const GROUND_TOP = 5 * TILE_SIZE
const STAND_Y = GROUND_TOP - balance.hitbox.height

interface Sim {
  player: Player
  input: InputState
}

function spawn(map: Tilemap, x: number, y: number): Sim {
  let sim: Sim = { player: createPlayer(x, y, balance), input: INITIAL_INPUT }
  // 지면에 안착시킨다.
  for (let i = 0; i < 30 && !sim.player.body.onGround; i += 1) sim = tick(sim, map, 0)
  return sim
}

function tick(sim: Sim, map: Tilemap, frame: number): Sim {
  const input = advanceInput(sim.input, frame)
  const stepped = stepPlayer(sim.player, input, map, balance, dt)
  return { player: stepped.player, input: stepped.input }
}

function hold(sim: Sim, map: Tilemap, ticks: number, ...actions: readonly Action[]): Sim {
  const frame = frameOf(...actions)
  let current = sim
  for (let i = 0; i < ticks; i += 1) current = tick(current, map, frame)
  return current
}

/** 최대 속도로 달리는 상태를 만든다. 이륙 조건을 정확히 맞추기 위한 것. */
function atFullSpeed(sim: Sim, direction: -1 | 1): Sim {
  return { ...sim, player: { ...sim.player, body: { ...sim.player.body, vx: direction * balance.runSpeed } } }
}

describe('지상 이동', () => {
  it('가만히 있으면 idle 이다', () => {
    const sim = spawn(FLAT, 40, 0)
    expect(sim.player.state).toBe('idle')
    expect(sim.player.body.y).toBe(STAND_Y)
  })

  it('달리면 run 이 되고 최대 속도에서 멈춘다', () => {
    const sim = hold(spawn(FLAT, 40, 0), FLAT, 20, 'right')
    expect(sim.player.state).toBe('run')
    expect(sim.player.body.vx).toBe(balance.runSpeed)
  })

  it('바라보는 방향이 입력을 따라간다', () => {
    const right = hold(spawn(FLAT, 100, 0), FLAT, 5, 'right')
    expect(right.player.facing).toBe(1)

    const left = hold(right, FLAT, 5, 'left')
    expect(left.player.facing).toBe(-1)

    // 입력을 떼면 마지막 방향을 유지한다.
    expect(hold(left, FLAT, 5).player.facing).toBe(-1)
  })
})

describe('고정 점프 궤도 — GOAL 비협상 원칙 1', () => {
  it('공중에서 반대 방향을 눌러도 궤도가 바뀌지 않는다', () => {
    const running = atFullSpeed(spawn(FLAT, 40, 0), 1)
    const airborne = hold(running, FLAT, 1, 'right', 'jump')
    expect(airborne.player.jumped).toBe(true)

    const takeoffVx = airborne.player.body.vx
    const fighting = hold(airborne, FLAT, 10, 'left')
    expect(fighting.player.body.vx).toBe(takeoffVx)
  })

  it('공중에서 입력을 떼도 속도가 유지된다', () => {
    const running = atFullSpeed(spawn(FLAT, 40, 0), 1)
    const airborne = hold(running, FLAT, 1, 'right', 'jump')
    expect(hold(airborne, FLAT, 10).player.body.vx).toBe(balance.runSpeed)
  })

  it('버튼을 짧게 눌러도 높이가 같다 — 가변 점프 없음', () => {
    // 탭과 홀드가 같은 궤도를 그린다. 이것이 "점프가 완전히 예측 가능하다"의 정의다.
    const tap = apexOf(1)
    const held = apexOf(60)
    expect(tap).toBe(held)
    expect(tap).toBeCloseTo(62.3, 1)
  })
})

/** 점프 버튼을 `holdFrames` 만큼 누른 뒤 최고 도달 높이를 잰다. */
function apexOf(holdFrames: number): number {
  let sim = spawn(FLAT, 40, 0)
  let highest = sim.player.body.y

  for (let i = 0; i < 60; i += 1) {
    sim = tick(sim, FLAT, i < holdFrames ? frameOf('jump') : 0)
    highest = Math.min(highest, sim.player.body.y)
  }
  return STAND_Y - highest
}

describe('캘리브레이션 — 실측 대 궤도 시뮬레이션', () => {
  /** 평지에서 최대 속도로 점프해 착지까지의 수평 거리를 잰다. */
  function measure(): { distance: number; height: number; airFrames: number } {
    let sim = atFullSpeed(spawn(FLAT, 32, 0), 1)
    const takeoffX = sim.player.body.x
    let highest = sim.player.body.y
    let frames = 0

    sim = tick(sim, FLAT, frameOf('right', 'jump'))
    expect(sim.player.jumped).toBe(true)

    while (!sim.player.body.onGround && frames < 200) {
      highest = Math.min(highest, sim.player.body.y)
      sim = tick(sim, FLAT, frameOf('right'))
      frames += 1
    }

    return {
      distance: sim.player.body.x - takeoffX,
      height: STAND_Y - highest,
      airFrames: frames + 1,
    }
  }

  it('실측 거리가 궤도 시뮬레이션과 1px 안에서 일치한다', () => {
    // 오버레이가 그리는 궤도와 실제 판정이 갈라지면 측정이 무의미해진다.
    const measured = measure()
    const arc = simulateJumpArc(balance, { dt })
    expect(Math.abs(measured.distance - arc.distance)).toBeLessThan(1)
  })

  it('실측값이 docs/02 표와 일치한다', () => {
    const measured = measure()
    expect(measured.distance).toBeCloseTo(62.3, 1)
    expect(measured.height).toBeCloseTo(62.3, 1)
    expect(measured.airFrames).toBe(34)
  })

  it('체공이 0.567초다', () => {
    expect(simulateJumpArc(balance, { dt }).airSeconds).toBeCloseTo(0.567, 3)
  })
})

describe('캘리브레이션 — 간격 통과', () => {
  /** 왼쪽 발판 끝에서 최대 속도로 뛰어 건널 수 있는가. */
  function clears(gapTiles: number): boolean {
    const left = 10
    const width = left + gapTiles + 10
    const map = parseTilemap([
      '.'.repeat(width),
      '.'.repeat(width),
      '.'.repeat(width),
      '.'.repeat(width),
      '.'.repeat(width),
      '#'.repeat(left) + '.'.repeat(gapTiles) + '#'.repeat(10),
    ])

    const ledge = left * TILE_SIZE
    let sim = atFullSpeed(spawn(map, ledge - balance.hitbox.width, 0), 1)
    sim = tick(sim, map, frameOf('right', 'jump'))

    for (let i = 0; i < 200; i += 1) {
      sim = tick(sim, map, frameOf('right'))
      if (sim.player.body.onGround) return sim.player.body.x > ledge
      if (sim.player.body.y > 6 * TILE_SIZE) return false
    }
    return false
  }

  it('3타일(48px)은 건넌다', () => {
    expect(clears(3)).toBe(true)
  })

  it('4타일(64px)은 건너지 못한다 — 궤도가 62.3px 다', () => {
    expect(clears(4)).toBe(false)
  })
})

describe('코요테 타임', () => {
  /** 발판 끝에서 걸어 나가 N 프레임 뒤에 점프한다. */
  function jumpAfterLeaving(delayFrames: number): boolean {
    const map = parseTilemap([
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '##########....................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '##############################',
    ])

    let sim = spawn(map, 120, 0)
    // 발판 끝(x=160)까지 걸어간다.
    while (sim.player.body.onGround) sim = tick(sim, map, frameOf('right'))

    for (let i = 0; i < delayFrames; i += 1) sim = tick(sim, map, frameOf('right'))
    const jumping = tick(sim, map, frameOf('right', 'jump'))
    return jumping.player.jumped
  }

  it('벗어난 직후에는 점프를 받아준다', () => {
    expect(jumpAfterLeaving(0)).toBe(true)
  })

  it('4프레임까지는 받아준다', () => {
    expect(jumpAfterLeaving(3)).toBe(true)
  })

  it('창이 닫히면 받지 않는다', () => {
    expect(jumpAfterLeaving(10)).toBe(false)
  })
})

describe('점프 버퍼', () => {
  it('착지 직전에 누른 점프가 착지 순간 발동한다', () => {
    let sim = hold(spawn(FLAT, 40, 0), FLAT, 1, 'jump')
    expect(sim.player.jumped).toBe(true)

    // 착지 3프레임 전까지 공중에 있는다.
    let framesToLand = 0
    while (!sim.player.body.onGround && framesToLand < 100) {
      sim = tick(sim, FLAT, 0)
      framesToLand += 1
      if (framesToLand === 30) break
    }

    // 착지 전에 점프를 눌러둔다.
    sim = tick(sim, FLAT, frameOf('jump'))
    let jumpedAgain = false
    for (let i = 0; i < 6; i += 1) {
      sim = tick(sim, FLAT, 0)
      if (sim.player.jumped) jumpedAgain = true
    }
    expect(jumpedAgain).toBe(true)
  })

  it('버퍼가 만료되면 발동하지 않는다', () => {
    let sim = hold(spawn(FLAT, 40, 0), FLAT, 1, 'jump')
    // 공중에서 일찍 눌러 버퍼를 만료시킨다.
    sim = tick(sim, FLAT, frameOf('jump'))
    let jumpedAgain = false
    for (let i = 0; i < 40; i += 1) {
      sim = tick(sim, FLAT, 0)
      if (sim.player.jumped) jumpedAgain = true
    }
    expect(jumpedAgain).toBe(false)
  })
})

describe('웅크리기', () => {
  it('히트박스가 12x16 으로 줄고 발 위치는 그대로다', () => {
    const sim = hold(spawn(FLAT, 40, 0), FLAT, 3, 'down')
    expect(sim.player.crouching).toBe(true)
    expect(sim.player.state).toBe('crouch')
    expect(sim.player.body.height).toBe(balance.crouchHitbox.height)
    expect(sim.player.body.y + sim.player.body.height).toBe(GROUND_TOP)
  })

  it('웅크린 채로는 걷지 않는다', () => {
    const sim = hold(spawn(FLAT, 40, 0), FLAT, 10, 'down', 'right')
    expect(sim.player.body.vx).toBe(0)
  })

  it('웅크린 채로는 뛰지 않는다', () => {
    const sim = hold(spawn(FLAT, 40, 0), FLAT, 5, 'down', 'jump')
    expect(sim.player.jumped).toBe(false)
  })

  it('입력을 떼면 일어선다', () => {
    const crouched = hold(spawn(FLAT, 40, 0), FLAT, 3, 'down')
    const standing = hold(crouched, FLAT, 3)
    expect(standing.player.crouching).toBe(false)
    expect(standing.player.body.height).toBe(balance.hitbox.height)
    expect(standing.player.body.y).toBe(STAND_Y)
  })

  it('머리 위가 막혀 있으면 웅크린 채로 남는다', () => {
    // 천장이 낮은 통로. 일어서면 지형에 낀다.
    const low = parseTilemap([
      '####################',
      '####################',
      '####################',
      '####################',
      '####################',
      '##################..',
      '####################',
    ])
    const tunnelY = 5 * TILE_SIZE
    let sim: Sim = {
      player: {
        ...createPlayer(18 * TILE_SIZE, tunnelY, balance),
        crouching: true,
        body: {
          ...createPlayer(18 * TILE_SIZE, tunnelY, balance).body,
          width: balance.crouchHitbox.width,
          height: balance.crouchHitbox.height,
        },
      },
      input: INITIAL_INPUT,
    }
    sim = hold(sim, low, 5)
    expect(sim.player.crouching).toBe(true)
  })
})

describe('상태 전이', () => {
  it('상승은 jump, 하강은 fall 이다', () => {
    let sim = hold(spawn(FLAT, 40, 0), FLAT, 1, 'jump')
    expect(sim.player.state).toBe('jump')

    let sawFall = false
    for (let i = 0; i < 40; i += 1) {
      sim = tick(sim, FLAT, 0)
      if (sim.player.state === 'fall') sawFall = true
      if (sim.player.body.onGround) break
    }
    expect(sawFall).toBe(true)
    expect(sim.player.state).toBe('idle')
  })

  it('착지를 한 틱만 보고한다', () => {
    let sim = hold(spawn(FLAT, 40, 0), FLAT, 1, 'jump')
    let landings = 0
    for (let i = 0; i < 60; i += 1) {
      sim = tick(sim, FLAT, 0)
      if (sim.player.landed) landings += 1
    }
    expect(landings).toBe(1)
  })
})

describe('불변성', () => {
  it('원본 플레이어를 바꾸지 않는다', () => {
    const sim = spawn(FLAT, 40, 0)
    const snapshot = JSON.stringify(sim.player)
    stepPlayer(sim.player, advanceInput(sim.input, frameOf('right', 'jump')), FLAT, balance, dt)
    expect(JSON.stringify(sim.player)).toBe(snapshot)
  })
})
