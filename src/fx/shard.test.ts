import { describe, expect, it } from 'vitest'
import { createRng } from '../core/rng.ts'
import { partsFor, paletteFor } from '../sprite/armor.ts'
import { pose } from '../sprite/pose.ts'
import {
  ARMOR_INDICES,
  armorPixels,
  pruneShards,
  shardAlpha,
  spawnShards,
  stepShards,
  type Shard,
} from './shard.ts'

const frame = pose(partsFor('steel'))
const palette = paletteFor('steel')
const pixels = armorPixels(frame, palette)

const PHYSICS = { gravity: 1750, restitution: 0.36, groundY: 200 }

function spawn(count = 24, seed = 7) {
  return spawnShards({
    pixels,
    count,
    origin: { x: 100, y: 150 },
    impact: { x: 16, y: 14 },
    rng: createRng(seed),
  })
}

describe('갑옷 픽셀 샘플링', () => {
  it('실제 스프라이트에서 뽑는다 — 범용 파티클이 아니다', () => {
    expect(pixels.length).toBeGreaterThan(50)
  })

  it('갑옷 면 색만 가져온다 — 아웃라인과 깃털은 파편이 아니다', () => {
    const colors = new Set(pixels.map((p) => p.color))
    const armorColors = new Set([...ARMOR_INDICES].map((ch) => palette[ch]))
    for (const color of colors) expect(armorColors.has(color)).toBe(true)
    // 아웃라인 색은 섞이지 않는다
    expect(colors.has(palette['0'] ?? '')).toBe(false)
  })

  it('좌표가 스프라이트 안에 있다', () => {
    for (const p of pixels) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(32)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThan(32)
    }
  })

  it('상태마다 색이 다르다 — 성유물은 금색으로 부서진다', () => {
    const relic = armorPixels(pose(partsFor('relic')), paletteFor('relic'))
    const steelColors = new Set(pixels.map((p) => p.color))
    const relicColors = new Set(relic.map((p) => p.color))
    expect([...relicColors].some((c) => !steelColors.has(c))).toBe(true)
  })

  it('빈 매트릭스는 빈 목록을 준다', () => {
    expect(armorPixels([], palette)).toEqual([])
  })
})

describe('파편 생성', () => {
  it('24개를 만든다 — docs/06 6.3', () => {
    expect(spawn(24).shards).toHaveLength(24)
  })

  it('색이 실제 갑옷 색이다', () => {
    const armorColors = new Set(pixels.map((p) => p.color))
    for (const shard of spawn().shards) expect(armorColors.has(shard.color)).toBe(true)
  })

  it('스프라이트가 있던 자리에서 출발한다', () => {
    for (const shard of spawn().shards) {
      expect(shard.x).toBeGreaterThanOrEqual(100)
      expect(shard.x).toBeLessThan(132)
      expect(shard.y).toBeGreaterThanOrEqual(150)
      expect(shard.y).toBeLessThan(182)
    }
  })

  it('속도가 120~260 범위다', () => {
    for (const shard of spawn().shards) {
      // vy 에 위쪽 보정 -60 이 더해지므로 수평 성분으로 확인한다
      const speed = Math.hypot(shard.vx, shard.vy + 60)
      expect(speed).toBeGreaterThanOrEqual(119)
      expect(speed).toBeLessThanOrEqual(261)
    }
  })

  it('피격 지점에서 바깥으로 튄다', () => {
    // 왼쪽 위를 맞으면 파편 다수가 오른쪽 아래로 향한다
    const hit = spawnShards({
      pixels, count: 40, origin: { x: 0, y: 0 },
      impact: { x: 0, y: 0 }, rng: createRng(3),
    })
    const rightward = hit.shards.filter((s) => s.vx > 0).length
    expect(rightward).toBeGreaterThan(hit.shards.length * 0.6)
  })

  it('같은 시드는 같은 파편을 만든다 — 리플레이가 깨지지 않는다', () => {
    expect(spawn(24, 42).shards).toEqual(spawn(24, 42).shards)
  })

  it('다른 시드는 다르게 흩어진다', () => {
    expect(spawn(24, 1).shards).not.toEqual(spawn(24, 2).shards)
  })

  it('난수 상태를 앞으로 돌려준다', () => {
    const result = spawn()
    expect(result.rng).not.toBe(createRng(7))
  })

  it('픽셀이 없으면 아무것도 안 만든다', () => {
    const empty = spawnShards({
      pixels: [], count: 24, origin: { x: 0, y: 0 },
      impact: { x: 0, y: 0 }, rng: createRng(1),
    })
    expect(empty.shards).toEqual([])
  })
})

describe('파편 물리', () => {
  const dt = 1 / 60

  it('중력을 받아 떨어진다', () => {
    const one: Shard[] = [{
      x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0,
      color: '#fff', resting: false, ageMs: 0,
    }]
    const after = stepShards(one, PHYSICS, dt)[0]
    expect(after?.vy).toBeCloseTo(1750 * dt)
    expect(after?.y).toBeGreaterThan(0)
  })

  it('지면에서 튕긴다 — 복원계수 0.36', () => {
    const falling: Shard[] = [{
      x: 0, y: 199, vx: 0, vy: 300, rotation: 0, spin: 0,
      color: '#fff', resting: false, ageMs: 0,
    }]
    const after = stepShards(falling, PHYSICS, dt)[0]
    expect(after?.y).toBe(200)
    expect(after?.vy).toBeLessThan(0)
    expect(Math.abs(after?.vy ?? 0)).toBeCloseTo((300 + 1750 * dt) * 0.36, 0)
  })

  it('결국 멈춰서 지면에 눕는다', () => {
    let shards = spawn().shards
    for (let i = 0; i < 300; i += 1) shards = stepShards(shards, PHYSICS, dt)
    expect(shards.every((s) => s.resting)).toBe(true)
    expect(shards.every((s) => s.y === PHYSICS.groundY)).toBe(true)
  })

  it('멈춘 파편은 회전하지 않는다', () => {
    const rested: Shard[] = [{
      x: 0, y: 200, vx: 0, vy: 0, rotation: 1.5, spin: 20,
      color: '#fff', resting: true, ageMs: 0,
    }]
    expect(stepShards(rested, PHYSICS, dt)[0]?.rotation).toBe(1.5)
  })

  it('나이는 멈춘 뒤에도 쌓인다 — 페이드 타이머다', () => {
    const rested: Shard[] = [{
      x: 0, y: 200, vx: 0, vy: 0, rotation: 0, spin: 0,
      color: '#fff', resting: true, ageMs: 0,
    }]
    expect(stepShards(rested, PHYSICS, dt)[0]?.ageMs).toBeCloseTo(1000 / 60)
  })

  it('빈 목록은 같은 객체를 돌려준다', () => {
    const empty: readonly Shard[] = []
    expect(stepShards(empty, PHYSICS, dt)).toBe(empty)
  })
})

describe('페이드 — 3초간 증거로 남는다', () => {
  const at = (ageMs: number): Shard => ({
    x: 0, y: 0, vx: 0, vy: 0, rotation: 0, spin: 0,
    color: '#fff', resting: true, ageMs,
  })

  it('3초까지는 온전히 보인다', () => {
    expect(shardAlpha(at(0))).toBe(1)
    expect(shardAlpha(at(2999))).toBe(1)
  })

  it('그 뒤 0.5초에 걸쳐 사라진다', () => {
    expect(shardAlpha(at(3250))).toBeCloseTo(0.5)
    expect(shardAlpha(at(3500))).toBe(0)
  })

  it('사라진 것만 걷어낸다', () => {
    const mixed = [at(0), at(4000), at(1000)]
    expect(pruneShards(mixed)).toHaveLength(2)
  })

  it('걷어낼 것이 없으면 같은 객체를 돌려준다', () => {
    const alive = [at(0), at(100)]
    expect(pruneShards(alive)).toBe(alive)
  })
})
