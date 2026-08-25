import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../../core/config.ts'
import { createRng } from '../../core/rng.ts'
import { parseTilemap } from '../../physics/tilemap.ts'
import {
  ENEMY_KINDS,
  ENEMY_SPECS,
  HIT_FLASH_FRAMES,
  boxOfEnemy,
  createEnemy,
  damage,
  distanceTo,
  FALL_OUT_MARGIN_TILES, pruneEnemies,
  setState,
  tickFlash,
  touches,
  type Enemy,
} from './enemy.ts'
import { GHOUL, isVulnerable, stepGhoul } from './ghoul.ts'
import { GRIMM, isStunned, stepGrimm } from './grimm.ts'
import { CORVID, isCommitted, stepCorvid } from './corvid.ts'

const GRAVITY = 1750
const dt = TICK_SECONDS

/** 넓은 평지. 지면 상단 y=160. */
const FLAT = parseTilemap([
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '####################',
])
const GROUND = 10 * 16

function make(kind: Parameters<typeof createEnemy>[1], x: number, y: number, state?: string): Enemy {
  return createEnemy(1, kind, x, y, createRng(9), state)
}

describe('적 공통 — HP 는 docs/05 5.2', () => {
  it('세 종의 HP 가 표와 같다', () => {
    expect(ENEMY_SPECS.ghoul.hp).toBe(20)
    expect(ENEMY_SPECS.grimm.hp).toBe(30)
    expect(ENEMY_SPECS.corvid.hp).toBe(12)
  })

  it('히트박스가 스프라이트(32px)보다 작다 — 관대한 판정', () => {
    for (const kind of ENEMY_KINDS) {
      expect(ENEMY_SPECS[kind].width).toBeLessThan(32)
      expect(ENEMY_SPECS[kind].height).toBeLessThan(32)
    }
  })
})

describe('데미지', () => {
  it('HP 가 줄고 플래시가 켜진다', () => {
    const hit = damage(make('ghoul', 0, 0), 6)
    expect(hit.enemy.hp).toBe(14)
    expect(hit.enemy.hitFlash).toBe(HIT_FLASH_FRAMES)
    expect(hit.killed).toBe(false)
    expect(hit.absorbed).toBe(true)
  })

  it('창 두 대에 좀비가 죽는다 — 데미지 10, HP 20', () => {
    const once = damage(make('ghoul', 0, 0), 10)
    expect(once.killed).toBe(false)
    expect(damage(once.enemy, 10).killed).toBe(true)
  })

  it('죽은 적은 다시 맞지 않는다 — 시체에 투사체를 낭비하지 않게', () => {
    const dead = damage(make('corvid', 0, 0), 99).enemy
    const again = damage(dead, 10)
    expect(again.absorbed).toBe(false)
    expect(again.enemy).toBe(dead)
  })

  it('플래시가 프레임마다 준다', () => {
    let e = damage(make('ghoul', 0, 0), 1).enemy
    e = tickFlash(e)
    expect(e.hitFlash).toBe(HIT_FLASH_FRAMES - 1)
    e = tickFlash(e)
    expect(tickFlash(e)).toBe(e)
  })

  it('죽은 적을 걷어낸다', () => {
    const list = [make('ghoul', 0, 0), damage(make('corvid', 0, 0), 99).enemy]
    expect(pruneEnemies(list)).toHaveLength(1)
    const alive = [make('ghoul', 0, 0)]
    expect(pruneEnemies(alive)).toBe(alive)
  })
})

describe('접촉', () => {
  it('겹치면 닿는다', () => {
    const e = make('ghoul', 100, 100)
    expect(touches(e, { x: 105, y: 105, width: 12, height: 26 })).toBe(true)
    expect(touches(e, { x: 300, y: 100, width: 12, height: 26 })).toBe(false)
  })

  it('죽은 적은 때리지 않는다', () => {
    const dead = damage(make('ghoul', 100, 100), 99).enemy
    expect(touches(dead, { x: 100, y: 100, width: 12, height: 26 })).toBe(false)
  })
})

describe('상태', () => {
  it('같은 상태면 프레임만 센다', () => {
    const a = setState(make('ghoul', 0, 0, 'walk'), 'walk')
    expect(a.stateFrames).toBe(1)
  })

  it('상태가 바뀌면 0 부터 다시 센다', () => {
    const a = setState(setState(make('ghoul', 0, 0, 'walk'), 'walk'), 'chase')
    expect(a.stateFrames).toBe(0)
  })

  it('거리를 잰다', () => {
    const e = make('ghoul', 100, 100)
    const box = boxOfEnemy(e)
    expect(distanceTo(e, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(0)
  })
})

describe('좀비 — 느리고 예측 가능하다', () => {
  it('솟아나는 동안은 때릴 수 없다 — 나오자마자 맞는 것은 부당하다', () => {
    let e = make('ghoul', 50, GROUND - 22)
    expect(isVulnerable(e)).toBe(false)
    for (let i = 0; i < GHOUL.riseFrames + 2; i += 1) e = stepGhoul(e, FLAT, GRAVITY, dt)
    expect(isVulnerable(e)).toBe(true)
    expect(e.state).toBe('walk')
  })

  it('솟아난 뒤 전진한다', () => {
    let e = make('ghoul', 100, GROUND - 22)
    for (let i = 0; i < GHOUL.riseFrames + 60; i += 1) e = stepGhoul(e, FLAT, GRAVITY, dt)
    expect(e.body.x).toBeLessThan(100)
  })

  it('플레이어보다 훨씬 느리다 — 튜토리얼 적이다', () => {
    expect(GHOUL.speed).toBeLessThan(110 / 3)
  })

  it('벽에 막히면 돌아선다 — 제자리에서 떨지 않는다', () => {
    const walled = parseTilemap([
      '#..................#',
      '#..................#',
      '####################',
    ])
    let e = make('ghoul', 20, 2 * 16 - 22, 'walk')
    for (let i = 0; i < 200; i += 1) e = stepGhoul(e, walled, GRAVITY, dt)
    expect(e.facing).toBe(1)
  })

  it('죽으면 움직이지 않는다', () => {
    const dead = damage(make('ghoul', 100, 100, 'walk'), 99).enemy
    expect(stepGhoul(dead, FLAT, GRAVITY, dt)).toBe(dead)
  })
})

describe('그림 — 공정성이 규칙이다', () => {
  const view = { x: 0, y: 0, width: 320, height: 176 }

  it('화면 밖에서는 깨어나지 않는다 — 안 보이는 곳에서 날아오면 부당하다', () => {
    const offscreen = make('grimm', 900, 40, 'dormant')
    const near = { x: 900, y: 40 }
    const stepped = stepGrimm(offscreen, FLAT, { target: near, view }, GRAVITY, dt)
    expect(stepped.state).toBe('dormant')
  })

  it('반경 밖이면 깨어나지 않는다 — 플레이어가 거리를 통제한다', () => {
    const e = make('grimm', 40, 40, 'dormant')
    const far = { x: 40 + GRIMM.aggroRadius + 40, y: 40 }
    expect(stepGrimm(e, FLAT, { target: far, view }, GRAVITY, dt).state).toBe('dormant')
  })

  it('화면 안에서 반경에 들어오면 이륙한다', () => {
    const e = make('grimm', 40, 40, 'dormant')
    expect(stepGrimm(e, FLAT, { target: { x: 60, y: 60 }, view }, GRAVITY, dt).state).toBe('chase')
  })

  it('사인파로 온다 — 직선이면 피하기 쉽고 긴장이 없다', () => {
    let e = make('grimm', 40, 40, 'chase')
    const target = { x: 300, y: 40 }
    const ys: number[] = []
    for (let i = 0; i < 60; i += 1) {
      e = stepGrimm(e, FLAT, { target, view: { x: 0, y: 0, width: 999, height: 999 } }, GRAVITY, dt)
      ys.push(e.body.y)
    }
    // 목표와 같은 높이인데도 y 가 흔들린다
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(4)
  })

  it('착지하면 3초 멈춘다 — 유일한 확정 공격 타이밍', () => {
    expect(GRIMM.landedFrames).toBe(180)
    let e = make('grimm', 100, GROUND - 20, 'chase')
    const target = { x: 100, y: GROUND }
    const wide = { x: 0, y: 0, width: 999, height: 999 }
    for (let i = 0; i < 60; i += 1) e = stepGrimm(e, FLAT, { target, view: wide }, GRAVITY, dt)
    expect(e.state).toBe('landed')
    expect(isStunned(e)).toBe(true)
  })

  it('3초가 지나면 다시 날아오른다', () => {
    let e = make('grimm', 100, GROUND - 16, 'landed')
    const target = { x: 200, y: 40 }
    const wide = { x: 0, y: 0, width: 999, height: 999 }
    for (let i = 0; i < GRIMM.landedFrames + 5; i += 1) {
      e = stepGrimm(e, FLAT, { target, view: wide }, GRAVITY, dt)
    }
    expect(e.state).toBe('chase')
  })
})

describe('까마귀 — 궤도를 바꾸지 않는다', () => {
  it('플레이어가 아래를 지날 때만 급강하한다', () => {
    const e = make('corvid', 100, 40, 'perch')
    // 위에 있으면 반응하지 않는다
    expect(stepCorvid(e, FLAT, { x: 104, y: 10 }, dt).state).toBe('perch')
    // 가로로 멀면 반응하지 않는다
    expect(stepCorvid(e, FLAT, { x: 300, y: 120 }, dt).state).toBe('perch')
    // 아래를 지나면 내려온다
    expect(stepCorvid(e, FLAT, { x: 104, y: 120 }, dt).state).toBe('dive')
  })

  it('급강하 중에는 플레이어를 따라오지 않는다 — 유도하면 피할 수 없다', () => {
    let e = make('corvid', 100, 40, 'perch')
    e = stepCorvid(e, FLAT, { x: 104, y: 120 }, dt)
    const vx0 = e.body.vx

    // 플레이어가 반대편으로 도망가도 궤도가 그대로다
    for (let i = 0; i < 10; i += 1) e = stepCorvid(e, FLAT, { x: -500, y: 120 }, dt)
    expect(e.body.vx).toBe(vx0)
    expect(isCommitted(e)).toBe(true)
  })

  it('지면에 닿으면 활공으로 빠져나간다 — 한 번 지나가면 다시 오지 않는다', () => {
    let e = make('corvid', 100, 40, 'perch')
    e = stepCorvid(e, FLAT, { x: 104, y: 150 }, dt)
    for (let i = 0; i < 120; i += 1) e = stepCorvid(e, FLAT, { x: 104, y: 150 }, dt)
    expect(e.state).toBe('glide')
  })

  it('급강하가 활공보다 빠르다', () => {
    expect(CORVID.diveSpeed).toBeGreaterThan(CORVID.glideSpeed)
  })
})

describe('맵 밖으로 떨어진 적', () => {
  const MAP = parseTilemap([
    '..........',
    '..........',
    '##########',
  ])

  function at(y: number) {
    return { ...make('ghoul', 32, 0), body: { ...make('ghoul', 32, 0).body, y } }
  }

  it('구덩이에 빠져 맵 아래로 사라지면 걷어낸다', () => {
    // 죽지 않으므로 그대로 두면 영원히 떨어지며 매 틱 밟힌다.
    const deep = at((MAP.height + FALL_OUT_MARGIN_TILES) * MAP.tileSize + 1)
    expect(pruneEnemies([deep], MAP)).toHaveLength(0)
  })

  it('아직 화면 아래 여유 안이면 남긴다 — 떨어지는 중에 사라지면 안 된다', () => {
    const falling = at((MAP.height + FALL_OUT_MARGIN_TILES) * MAP.tileSize - 1)
    expect(pruneEnemies([falling], MAP)).toHaveLength(1)
  })

  it('죽은 적은 여전히 걷어낸다', () => {
    const dead = { ...at(0), dead: true }
    expect(pruneEnemies([dead], MAP)).toHaveLength(0)
  })

  it('걷어낼 것이 없으면 같은 배열을 돌려준다', () => {
    const list = [at(0)]
    expect(pruneEnemies(list, MAP)).toBe(list)
  })

  it('맵을 안 주면 낙하 판정을 하지 않는다 — 기존 호출부와 호환된다', () => {
    expect(pruneEnemies([at(99999)])).toHaveLength(1)
  })
})
