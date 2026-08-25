import { describe, expect, it } from 'vitest'
import { partsFor } from '../sprite/armor.ts'
import { pose } from '../sprite/pose.ts'
import { SPRITE_SIZE } from '../sprite/matrix.ts'
import { dissolve, skeletonizeFrame } from './dissolve.ts'

const flesh = pose(partsFor('bare'))
const bones = pose(partsFor('bones'))

/** 두 매트릭스가 다른 픽셀 수. */
function diff(a: readonly string[], b: readonly string[]): number {
  let n = 0
  a.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) if (row[x] !== b[y]?.[x]) n += 1
  })
  return n
}

describe('디졸브', () => {
  it('0 이면 원본, 1 이면 목표다', () => {
    expect(dissolve(flesh, bones, 0)).toBe(flesh)
    expect(dissolve(flesh, bones, 1)).toBe(bones)
  })

  it('중간에는 두 매트릭스가 섞인다', () => {
    const half = dissolve(flesh, bones, 0.5)
    expect(diff(half, flesh)).toBeGreaterThan(0)
    expect(diff(half, bones)).toBeGreaterThan(0)
  })

  it('진행할수록 목표에 가까워진다', () => {
    const steps = [0.2, 0.4, 0.6, 0.8].map((t) => diff(dissolve(flesh, bones, t), bones))
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] ?? Infinity)
    }
  })

  it('크기가 유지된다', () => {
    const half = dissolve(flesh, bones, 0.5)
    expect(half).toHaveLength(SPRITE_SIZE)
    expect(half.every((r) => r.length === SPRITE_SIZE)).toBe(true)
  })

  it('결정론적이다 — 리플레이가 깨지지 않는다', () => {
    expect(dissolve(flesh, bones, 0.37, 5)).toEqual(dissolve(flesh, bones, 0.37, 5))
  })

  it('시드가 다르면 벗겨지는 자리가 다르다', () => {
    expect(dissolve(flesh, bones, 0.5, 1)).not.toEqual(dissolve(flesh, bones, 0.5, 2))
  })

  it('바깥에서 안으로 벗겨진다 — 팔다리 끝부터 드러나고 몸통이 마지막', () => {
    const center = SPRITE_SIZE / 2
    const distance = (x: number, y: number) => Math.hypot(x - center, y - center)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

    // 살과 뼈가 실제로 다른 자리만 센다. 바깥은 둘 다 투명이라 바뀌어도 차이가 없다.
    const candidates: number[] = []
    flesh.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== bones[y]?.[x]) candidates.push(distance(x, y))
      }
    })
    expect(candidates.length).toBeGreaterThan(20)

    const early = dissolve(flesh, bones, 0.35)
    const peeled: number[] = []
    early.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== flesh[y]?.[x]) peeled.push(distance(x, y))
      }
    })
    expect(peeled.length).toBeGreaterThan(0)
    // 먼저 벗겨진 자리가 전체 평균보다 바깥이다
    expect(mean(peeled)).toBeGreaterThan(mean(candidates))
  })

  it('NaN 진행도는 0으로 본다', () => {
    expect(dissolve(flesh, bones, Number.NaN)).toBe(flesh)
  })
})

describe('백골화 8프레임', () => {
  it('마지막 프레임이 완전한 백골이다', () => {
    expect(skeletonizeFrame(flesh, bones, 7)).toEqual(bones)
  })

  it('첫 프레임은 아직 살이 대부분 남아 있다', () => {
    const first = skeletonizeFrame(flesh, bones, 0)
    expect(diff(first, flesh)).toBeLessThan(diff(bones, flesh) / 2)
  })

  it('프레임마다 뼈가 더 드러난다', () => {
    const distances = Array.from({ length: 8 }, (_, i) =>
      diff(skeletonizeFrame(flesh, bones, i), bones))
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeLessThanOrEqual(distances[i - 1] ?? Infinity)
    }
    expect(distances[7]).toBe(0)
  })
})
