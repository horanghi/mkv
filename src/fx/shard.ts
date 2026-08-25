import { nextFloat, type RngState } from '../core/rng.ts'
import type { Matrix } from '../sprite/matrix.ts'
import type { Palette } from '../sprite/palette.ts'

/**
 * 갑옷 파편.
 *
 * **범용 파티클을 쓰지 않는다.** 방금 깨진 갑옷의 실제 픽셀에서, 실제 색으로,
 * 실제 위치에서 날아가야 한다. 그래야 "내 갑옷이 부서졌다"로 읽힌다.
 *
 * 파편이 3초간 남는 이유는 **거기서 무슨 일이 있었는지의 물리적 증거**이기
 * 때문이다. 재시도할 때 그 자리를 지나가면 잔해가 아직 널려 있다.
 * → docs/06-visual-direction.md 6.3
 */

export interface ArmorPixel {
  readonly x: number
  readonly y: number
  readonly color: string
}

export interface Shard {
  /** 논리 좌표 (480×270 기준) */
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly rotation: number
  readonly spin: number
  readonly color: string
  readonly resting: boolean
  readonly ageMs: number
}

/** 갑옷 면을 이루는 색 인덱스. 아웃라인(0)과 깃털(7,8)은 파편이 아니다. */
export const ARMOR_INDICES = '1234'

/**
 * 스프라이트 매트릭스에서 갑옷 픽셀만 뽑는다.
 *
 * 좌표는 스프라이트 로컬(32×32)이다. 스폰할 때 월드 좌표로 옮긴다.
 */
export function armorPixels(
  matrix: Matrix,
  palette: Palette,
  indices: string = ARMOR_INDICES,
): readonly ArmorPixel[] {
  const pixels: ArmorPixel[] = []
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x]
      if (ch === undefined || !indices.includes(ch)) continue
      const color = palette[ch]
      if (color) pixels.push({ x, y, color })
    }
  })
  return pixels
}

export interface SpawnOptions {
  readonly pixels: readonly ArmorPixel[]
  readonly count: number
  /** 스프라이트 좌상단의 월드 좌표 */
  readonly origin: { readonly x: number; readonly y: number }
  /** 피격 지점(스프라이트 로컬). 파편이 여기서 바깥으로 튄다. */
  readonly impact: { readonly x: number; readonly y: number }
  readonly rng: RngState
  readonly speedMin?: number
  readonly speedMax?: number
}

export interface SpawnResult {
  readonly shards: readonly Shard[]
  readonly rng: RngState
}

/**
 * 픽셀에서 파편을 만든다.
 *
 * 속도는 피격 지점에서 **바깥 방향**이다. 사방으로 균등히 흩뿌리면
 * 폭발로 보이고, 맞은 자리에서 튄 것으로 읽히지 않는다.
 */
export function spawnShards(options: SpawnOptions): SpawnResult {
  const { pixels, count, origin, impact, speedMin = 120, speedMax = 260 } = options
  if (pixels.length === 0) return { shards: [], rng: options.rng }

  let rng = options.rng
  const shards: Shard[] = []

  for (let i = 0; i < count; i += 1) {
    const pick = nextFloat(rng)
    rng = pick.state
    const pixel = pixels[Math.floor(pick.value * pixels.length)]
    if (!pixel) continue

    const speedRoll = nextFloat(rng)
    rng = speedRoll.state
    const spinRoll = nextFloat(rng)
    rng = spinRoll.state
    const spreadRoll = nextFloat(rng)
    rng = spreadRoll.state

    const dx = pixel.x - impact.x
    const dy = pixel.y - impact.y
    // 피격 지점과 겹친 픽셀은 방향이 없다. 위쪽으로 밀어 올린다.
    const spread = (spreadRoll.value - 0.5) * 0.6
    const angle = Math.atan2(dy === 0 && dx === 0 ? -1 : dy, dx) + spread
    const speed = speedMin + speedRoll.value * (speedMax - speedMin)

    shards.push({
      x: origin.x + pixel.x,
      y: origin.y + pixel.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60, // 살짝 위로 — 아래로만 튀면 무너지는 것처럼 보인다
      rotation: 0,
      spin: (spinRoll.value - 0.5) * 24,
      color: pixel.color,
      resting: false,
      ageMs: 0,
    })
  }

  return { shards, rng }
}

export interface ShardPhysics {
  readonly gravity: number
  readonly restitution: number
  readonly groundY: number
  /** 이 속도 아래로 떨어지면 멈춘 것으로 본다. */
  readonly restSpeed?: number
}

/** 한 틱. 중력·회전·지면 반사. */
export function stepShards(
  shards: readonly Shard[],
  physics: ShardPhysics,
  dt: number,
): readonly Shard[] {
  if (shards.length === 0) return shards
  const restSpeed = physics.restSpeed ?? 24

  return shards.map((shard) => {
    const ageMs = shard.ageMs + dt * 1000
    if (shard.resting) return { ...shard, ageMs }

    const vy = shard.vy + physics.gravity * dt
    let x = shard.x + shard.vx * dt
    let y = shard.y + vy * dt
    let nextVx = shard.vx
    let nextVy = vy
    let resting = false

    if (y >= physics.groundY) {
      y = physics.groundY
      // 튕김. 복원계수 0.36 — 돌바닥에 쇳조각이 떨어지는 감각이다.
      nextVy = -vy * physics.restitution
      nextVx = shard.vx * 0.8
      if (Math.abs(nextVy) < restSpeed) {
        nextVy = 0
        nextVx = 0
        resting = true
      }
    }

    x = Number.isFinite(x) ? x : shard.x
    y = Number.isFinite(y) ? y : shard.y

    return {
      ...shard,
      x,
      y,
      vx: nextVx,
      vy: nextVy,
      rotation: resting ? shard.rotation : shard.rotation + shard.spin * dt,
      resting,
      ageMs,
    }
  })
}

/**
 * 파편 투명도. 3초간 그대로 있다가 페이드아웃한다.
 *
 * 바로 사라지면 증거가 남지 않는다.
 */
export function shardAlpha(shard: Shard, holdMs = 3000, fadeMs = 500): number {
  if (shard.ageMs <= holdMs) return 1
  const t = (shard.ageMs - holdMs) / fadeMs
  return Math.max(0, 1 - t)
}

/** 완전히 사라진 파편을 걷어낸다. */
export function pruneShards(shards: readonly Shard[], holdMs = 3000, fadeMs = 500): readonly Shard[] {
  const alive = shards.filter((s) => shardAlpha(s, holdMs, fadeMs) > 0)
  return alive.length === shards.length ? shards : alive
}
