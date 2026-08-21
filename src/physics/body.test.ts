import { describe, expect, it } from 'vitest'
import { TICK_SECONDS, TILE_SIZE } from '../core/config.ts'
import { boxOf, createBody, isGrounded, resolve, substepCount, type Body } from './body.ts'
import { parseTilemap, type Tilemap } from './tilemap.ts'

/**
 * ```
 *      0   16  32  48  64  80  96  112
 *  0   .   .   .   .   .   .   .   .
 *  16  .   .   .   .   .   .   .   .
 *  32  .   .   -   -   .   .   .   .     원웨이
 *  48  .   .   .   .   .   .   x   .     붕괴
 *  64  .   .   .   .   #   .   ^   .     단단함 · 위험
 *  80  #   #   #   #   #   #   #   #     지면
 * ```
 */
const MAP: Tilemap = parseTilemap([
  '........',
  '........',
  '..--....',
  '......x.',
  '....#.^.',
  '########',
])

const GROUND_TOP = 80
const ONE_WAY_TOP = 32
const WALL_LEFT = 64
const W = 12
const H = 26

const body = (x: number, y: number, vx = 0, vy = 0): Body => createBody(x, y, W, H, { vx, vy })

function step(b: Body, ticks = 1, options = {}): Body {
  let current = b
  for (let i = 0; i < ticks; i += 1) current = resolve(current, MAP, TICK_SECONDS, options).body
  return current
}

/**
 * 여러 틱을 돌리면서 접촉 플래그를 누적한다.
 *
 * `hitWall` 같은 플래그는 "이번 이동이 막혔다"는 뜻이라, 벽에 붙어 속도가 0 이 된
 * 다음 틱에는 다시 false 가 된다. 구간 전체에서 부딪혔는지 보려면 모아야 한다.
 */
function run(b: Body, ticks: number, options = {}) {
  let current = b
  let hitWall = false
  let hitCeiling = false
  for (let i = 0; i < ticks; i += 1) {
    current = resolve(current, MAP, TICK_SECONDS, options).body
    hitWall = hitWall || current.hitWall
    hitCeiling = hitCeiling || current.hitCeiling
  }
  return { body: current, hitWall, hitCeiling }
}

describe('서브스텝', () => {
  it('타일 한 칸 이내면 나누지 않는다', () => {
    expect(substepCount(10, 4, TILE_SIZE)).toBe(1)
    expect(substepCount(16, 16, TILE_SIZE)).toBe(1)
  })

  it('한 칸을 넘으면 나눈다', () => {
    expect(substepCount(17, 0, TILE_SIZE)).toBe(2)
    expect(substepCount(0, 100, TILE_SIZE)).toBe(7)
    expect(substepCount(-100, 0, TILE_SIZE)).toBe(7)
  })

  it('비정상 값은 한 걸음으로 본다', () => {
    expect(substepCount(Number.NaN, 0, TILE_SIZE)).toBe(1)
    expect(substepCount(Number.POSITIVE_INFINITY, 0, TILE_SIZE)).toBe(1)
  })
})

describe('낙하와 착지', () => {
  it('지면 위에 정확히 멈춘다', () => {
    const landed = step(body(8, 0, 0, 480), 30)
    expect(landed.y).toBe(GROUND_TOP - H)
    expect(landed.vy).toBe(0)
    expect(landed.onGround).toBe(true)
  })

  it('착지 후 가만히 있어도 접지 상태가 유지된다', () => {
    // vy 가 0 이면 세로 이동이 없어 착지 판정이 안 나온다. 그 구멍을 메운 것.
    const resting = step(body(8, GROUND_TOP - H), 5)
    expect(resting.onGround).toBe(true)
    expect(resting.y).toBe(GROUND_TOP - H)
  })

  it('허공에서는 접지가 아니다', () => {
    expect(step(body(8, 0, 0, 60)).onGround).toBe(false)
  })

  it('천장에 부딪히면 멈춘다', () => {
    // 지면 타일의 아래쪽 면에 머리를 박는다 (y 96 아래에서 위로).
    const bumped = resolve(createBody(8, 100, W, H, { vy: -600 }), MAP, TICK_SECONDS).body
    expect(bumped.y).toBe(96)
    expect(bumped.vy).toBe(0)
    expect(bumped.hitCeiling).toBe(true)
  })
})

describe('벽', () => {
  it('벽 왼쪽 면에 붙어 멈춘다', () => {
    const walked = run(body(20, GROUND_TOP - H, 600), 10)
    expect(walked.body.x).toBe(WALL_LEFT - W)
    expect(walked.body.vx).toBe(0)
    expect(walked.hitWall).toBe(true)
  })

  it('반대 방향에서도 멈춘다', () => {
    const walked = run(body(84, GROUND_TOP - H, -600), 10)
    expect(walked.body.x).toBe(WALL_LEFT + TILE_SIZE)
    expect(walked.hitWall).toBe(true)
  })

  it('정확히 맞닿은 상태에서는 아직 막히지 않는다', () => {
    // 오른쪽 면이 벽 왼쪽 면과 같다. 접촉은 겹침이 아니다.
    const flush = body(WALL_LEFT - W, GROUND_TOP - H)
    expect(step(flush).hitWall).toBe(false)
  })

  it('맞닿은 상태에서 한 걸음 더 가면 막힌다', () => {
    const nudged = resolve(
      createBody(WALL_LEFT - W, GROUND_TOP - H, W, H, { vx: 60 }),
      MAP,
      TICK_SECONDS,
    ).body
    expect(nudged.x).toBe(WALL_LEFT - W)
    expect(nudged.hitWall).toBe(true)
  })
})

describe('고속 이동 — 터널링', () => {
  it('한 틱에 6타일을 가도 벽을 뚫지 않는다', () => {
    const fast = resolve(createBody(8, GROUND_TOP - H, W, H, { vx: 6000 }), MAP, TICK_SECONDS).body
    expect(fast.x).toBe(WALL_LEFT - W)
    expect(fast.hitWall).toBe(true)
  })

  it('세로로 떨어져도 지면을 뚫지 않는다', () => {
    const fast = resolve(createBody(8, 0, W, H, { vy: 12000 }), MAP, TICK_SECONDS).body
    expect(fast.y).toBe(GROUND_TOP - H)
    expect(fast.onGround).toBe(true)
  })

  it('타일보다 작은 투사체도 뚫지 않는다', () => {
    const pellet = createBody(8, GROUND_TOP - 8, 2, 2, { vx: 9000 })
    expect(resolve(pellet, MAP, TICK_SECONDS).body.x).toBe(WALL_LEFT - 2)
  })

  it('맵 밖으로는 자유롭게 나간다', () => {
    // 낙사·경계 처리는 게임 규칙이지 충돌 규칙이 아니다.
    const escaped = resolve(createBody(8, 0, W, H, { vx: -3000 }), MAP, TICK_SECONDS).body
    expect(escaped.x).toBeLessThan(0)
    expect(escaped.hitWall).toBe(false)
  })
})

describe('원웨이 발판', () => {
  const ABOVE = ONE_WAY_TOP - H

  it('위에서 떨어지면 밟힌다', () => {
    const landed = step(body(36, 0, 0, 240), 20)
    expect(landed.y).toBe(ABOVE)
    expect(landed.onGround).toBe(true)
  })

  it('아래에서 올라오면 통과한다', () => {
    // 발판 아래(y 60)에서 위로. 발판을 가로질러 올라가되 한 번도 걸리지 않는다.
    const rising = run(body(36, 60, 0, -600), 6)
    expect(rising.body.y).toBe(0)
    expect(rising.hitCeiling).toBe(false)
  })

  it('아래에서 올라와 정점을 찍고 다시 내려오면 밟힌다', () => {
    const rising = step(body(36, 60, 0, -600), 6)
    expect(rising.y + H).toBeLessThanOrEqual(ONE_WAY_TOP)

    const falling = step({ ...rising, vy: 240 }, 20)
    expect(falling.y).toBe(ABOVE)
    expect(falling.onGround).toBe(true)
  })

  it('발판을 절반만 지난 채로 다시 내려오면 통과한다', () => {
    // 직전 프레임에 완전히 위에 있지 않았으므로 밟히지 않는다.
    const half = step(body(36, 60, 0, -600), 3)
    expect(half.y + H).toBeGreaterThan(ONE_WAY_TOP)
    expect(step({ ...half, vy: 240 }, 20).y).toBe(GROUND_TOP - H)
  })

  it('가로로는 막지 않는다', () => {
    // 원웨이 발판 높이에서 그대로 걸어 지나간다.
    const walked = step(body(0, ONE_WAY_TOP + 2, 600), 5)
    expect(walked.hitWall).toBe(false)
    expect(walked.x).toBeGreaterThan(48)
  })

  it('dropThrough 면 밟지 않고 빠진다', () => {
    const dropped = step({ ...body(36, ABOVE), vy: 240 }, 20, { dropThrough: true })
    expect(dropped.y).toBe(GROUND_TOP - H)
  })

  it('접지 판정에서는 발판도 지면이다', () => {
    expect(isGrounded(body(36, ABOVE), MAP)).toBe(true)
  })
})

describe('붕괴 타일', () => {
  const CRUMBLE_TOP = 48
  const CRUMBLE_X = 96

  it('무너지기 전까지는 단단하다', () => {
    const landed = step(body(CRUMBLE_X + 2, 0, 0, 480), 20)
    expect(landed.y).toBe(CRUMBLE_TOP - H)
    expect(landed.onGround).toBe(true)
  })

  it('밟으면 좌표를 보고한다', () => {
    const result = resolve(
      createBody(CRUMBLE_X + 2, CRUMBLE_TOP - H - 4, W, H, { vy: 480 }),
      MAP,
      TICK_SECONDS,
    )
    expect(result.crumbled).toEqual([{ tx: 6, ty: 3 }])
  })

  it('옆에서 부딪힌 것은 밟은 것이 아니다', () => {
    const result = resolve(
      createBody(CRUMBLE_X - W, CRUMBLE_TOP + 2, W, H, { vx: 600 }),
      MAP,
      TICK_SECONDS,
    )
    expect(result.body.hitWall).toBe(true)
    expect(result.crumbled).toEqual([])
  })

  it('같은 타일을 중복 보고하지 않는다', () => {
    const result = resolve(
      createBody(CRUMBLE_X + 2, 0, W, H, { vy: 6000 }),
      MAP,
      TICK_SECONDS,
    )
    expect(result.crumbled).toHaveLength(1)
  })
})

describe('위험 타일', () => {
  it('물리적으로는 통과한다 — 판정은 엔티티가 한다', () => {
    // 위험 타일 줄(y 64~80) 안에 들어가는 작은 몸으로 가로질러 본다.
    const small = createBody(88, 68, 8, 8, { vx: 600 })
    const through = run(small, 3)
    expect(through.hitWall).toBe(false)
    expect(through.body.x).toBeGreaterThan(112)
  })

  it('세로로 떨어져도 막지 않는다', () => {
    // 위험 타일을 통과해 그 아래 지면까지 내려간다.
    const small = createBody(100, 66, 8, 8, { vy: 480 })
    expect(step(small, 10).y).toBe(GROUND_TOP - 8)
  })
})

describe('축 분리 — X 먼저, 그 다음 Y', () => {
  it('안쪽 모서리로 대각 진입해도 튀지 않는다', () => {
    const diagonal = resolve(
      createBody(40, GROUND_TOP - H - 4, W, H, { vx: 900, vy: 480 }),
      MAP,
      TICK_SECONDS,
    ).body
    expect(diagonal.x).toBeLessThanOrEqual(WALL_LEFT - W)
    expect(diagonal.y).toBe(GROUND_TOP - H)
    expect(diagonal.onGround).toBe(true)
  })
})

describe('isGrounded', () => {
  it('지면 위면 참이다', () => {
    expect(isGrounded(body(8, GROUND_TOP - H), MAP)).toBe(true)
  })

  it('1px 만 떠도 거짓이다', () => {
    expect(isGrounded(body(8, GROUND_TOP - H - 1.5), MAP)).toBe(false)
  })

  it('발끝만 걸쳐도 참이다', () => {
    // 맵 왼쪽 끝 바깥으로 대부분 나가 있고 오른쪽 1px 만 지면 위에 있다.
    expect(isGrounded(createBody(-W + 1, GROUND_TOP - H, W, H), MAP)).toBe(true)
  })

  it('허공이면 거짓이다', () => {
    expect(isGrounded(body(8, 0), MAP)).toBe(false)
  })
})

describe('불변성', () => {
  it('원본 바디를 바꾸지 않는다', () => {
    const original = body(8, 0, 100, 480)
    const snapshot = { ...original }
    resolve(original, MAP, TICK_SECONDS)
    expect(original).toEqual(snapshot)
  })

  it('boxOf 는 위치와 크기를 그대로 준다', () => {
    expect(boxOf(body(3, 5))).toEqual({ x: 3, y: 5, width: W, height: H })
  })

  it('속도가 0 이면 제자리다', () => {
    const still = body(8, GROUND_TOP - H)
    expect(resolve(still, MAP, TICK_SECONDS).body.x).toBe(still.x)
  })
})
