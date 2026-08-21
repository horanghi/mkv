import { describe, expect, it } from 'vitest'
import { TICK_SECONDS, TILE_SIZE } from '../../core/config.ts'
import { loadBalance, requireWeapon } from '../../data/load.ts'
import type { Aabb } from '../../physics/aabb.ts'
import { parseTilemap, type Tilemap } from '../../physics/tilemap.ts'
import {
  EMPTY_WORLD,
  boxOfProjectile,
  countOf,
  spawnProjectile,
  stepProjectiles,
  type ProjectileWorld,
} from './projectile.ts'

const balance = loadBalance()
const lance = requireWeapon(balance, 'lance')

/** 가운데가 비어 있고 아래에 지면, 오른쪽에 벽이 있는 방. */
const ROOM: Tilemap = parseTilemap([
  '..........#',
  '..........#',
  '..........#',
  '..........#',
  '###########',
])

/** 플레이어 히트박스 — 왼쪽 바닥 위 */
const PLAYER: Aabb = { x: 16, y: 38, width: 12, height: 26 }

function fire(
  world: ProjectileWorld,
  direction: 'forward' | 'up' | 'down' | 'crouch' = 'forward',
  facing: -1 | 1 = 1,
): ProjectileWorld {
  return spawnProjectile(world, lance, { origin: PLAYER, facing, direction })
}

function run(world: ProjectileWorld, ticks: number): ProjectileWorld {
  let current = world
  for (let i = 0; i < ticks; i += 1) current = stepProjectiles(current, ROOM, TICK_SECONDS)
  return current
}

describe('창 수치 — docs/03 3.2', () => {
  it('데미지 10, 속도 320, 동시 2발', () => {
    expect(lance.damage).toBe(10)
    expect(lance.speed).toBe(320)
    expect(lance.maxOnScreen).toBe(2)
    expect(lance.arc).toBe('straight')
  })
})

describe('화면 2발 제한 — 시리즈 규칙', () => {
  it('상한까지 나간다', () => {
    const world = fire(fire(EMPTY_WORLD))
    expect(countOf(world, 'lance')).toBe(2)
  })

  it('상한을 넘으면 무시한다 — 던진 창을 지우지 않는다', () => {
    const full = fire(fire(EMPTY_WORLD))
    const third = fire(full)
    expect(third).toBe(full)
    expect(countOf(third, 'lance')).toBe(2)
  })

  it('한 발이 사라지면 다시 던질 수 있다', () => {
    let world = fire(fire(EMPTY_WORLD))
    // 벽(x=160)까지 날아가 사라질 때까지 돌린다.
    world = run(world, 60)
    expect(countOf(world, 'lance')).toBe(0)
    expect(countOf(fire(world), 'lance')).toBe(1)
  })

  it('id 가 겹치지 않는다', () => {
    const world = fire(fire(EMPTY_WORLD))
    const ids = world.projectiles.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('발사 방향', () => {
  it('정면은 바라보는 쪽으로 나간다', () => {
    const right = fire(EMPTY_WORLD, 'forward', 1).projectiles[0]
    expect(right?.vx).toBe(lance.speed)
    expect(right?.vy).toBe(0)
    // 앞쪽 면에서 나온다.
    expect(right?.x).toBe(PLAYER.x + PLAYER.width)

    const left = fire(EMPTY_WORLD, 'forward', -1).projectiles[0]
    expect(left?.vx).toBe(-lance.speed)
    expect(left && left.x + left.width).toBe(PLAYER.x)
  })

  it('상단은 위로 나가고 창이 눕는다', () => {
    const up = fire(EMPTY_WORLD, 'up').projectiles[0]
    expect(up?.vy).toBe(-lance.speed)
    expect(up?.vx).toBe(0)
    expect(up && up.height > up.width).toBe(true)
    expect(up && up.y + up.height).toBe(PLAYER.y)
  })

  it('하단은 아래로 나간다', () => {
    const down = fire(EMPTY_WORLD, 'down').projectiles[0]
    expect(down?.vy).toBe(lance.speed)
    expect(down?.y).toBe(PLAYER.y + PLAYER.height)
  })

  it('웅크린 발사는 정면보다 낮다', () => {
    const forward = fire(EMPTY_WORLD, 'forward').projectiles[0]
    const crouch = fire(EMPTY_WORLD, 'crouch').projectiles[0]
    expect(crouch && forward && crouch.y > forward.y).toBe(true)
    expect(crouch?.vx).toBe(lance.speed)
  })

  it('상하 발사는 플레이어 가운데에서 나온다', () => {
    const up = fire(EMPTY_WORLD, 'up').projectiles[0]
    const centerX = PLAYER.x + PLAYER.width / 2
    expect(up && up.x + up.width / 2).toBe(centerX)
  })
})

describe('비행', () => {
  it('틱당 속도만큼 나아간다', () => {
    const world = fire(EMPTY_WORLD)
    const start = world.projectiles[0]?.x ?? 0
    const after = run(world, 1).projectiles[0]
    expect(after && after.x - start).toBeCloseTo(lance.speed * TICK_SECONDS)
    expect(after?.ageFrames).toBe(1)
  })

  it('직선이다 — 중력을 받지 않는다', () => {
    const world = fire(EMPTY_WORLD)
    const y = world.projectiles[0]?.y
    expect(run(world, 20).projectiles[0]?.y).toBe(y)
  })

  it('벽에 닿으면 사라진다 — 관통하지 않는다', () => {
    // 벽은 x=160 부터다.
    const world = run(fire(EMPTY_WORLD), 60)
    expect(world.projectiles).toHaveLength(0)
  })

  it('지면에 닿으면 사라진다', () => {
    const world = run(fire(EMPTY_WORLD, 'down'), 20)
    expect(world.projectiles).toHaveLength(0)
  })

  it('맵 밖으로 나가면 사라진다', () => {
    const world = run(fire(EMPTY_WORLD, 'up'), 30)
    expect(world.projectiles).toHaveLength(0)
  })

  it('빠른 투사체도 벽을 뚫지 않는다', () => {
    const fast = { ...lance, speed: 9000 }
    const world = spawnProjectile(EMPTY_WORLD, fast, {
      origin: PLAYER,
      facing: 1,
      direction: 'forward',
    })
    expect(stepProjectiles(world, ROOM, TICK_SECONDS).projectiles).toHaveLength(0)
  })

  it('투사체가 없으면 같은 객체를 돌려준다', () => {
    expect(stepProjectiles(EMPTY_WORLD, ROOM, TICK_SECONDS)).toBe(EMPTY_WORLD)
  })
})

describe('상자 · 불변성', () => {
  it('상자를 그대로 돌려준다', () => {
    const p = fire(EMPTY_WORLD).projectiles[0]
    expect(p && boxOfProjectile(p)).toEqual({
      x: p?.x,
      y: p?.y,
      width: p?.width,
      height: p?.height,
    })
  })

  it('원본 월드를 바꾸지 않는다', () => {
    const world = fire(EMPTY_WORLD)
    const before = JSON.stringify(world)
    run(world, 5)
    fire(world)
    expect(JSON.stringify(world)).toBe(before)
  })

  it('타일 크기를 넘는 이동은 나눠서 검사한다', () => {
    expect(TILE_SIZE).toBe(16)
    // 320px/s = 틱당 5.3px — 한 걸음으로 충분하다.
    expect(lance.speed * TICK_SECONDS).toBeLessThan(TILE_SIZE)
  })
})
