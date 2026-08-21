import { describe, expect, it } from 'vitest'
import {
  bottom,
  centerX,
  centerY,
  containsPoint,
  fromCenter,
  fromEdges,
  overlaps,
  right,
  sweptBounds,
  translate,
  type Aabb,
} from './aabb.ts'

const box = (x: number, y: number, w = 10, h = 10): Aabb => ({ x, y, width: w, height: h })

describe('가장자리', () => {
  it('오른쪽·아래를 계산한다', () => {
    const b = box(4, 6, 12, 26)
    expect(right(b)).toBe(16)
    expect(bottom(b)).toBe(32)
    expect(centerX(b)).toBe(10)
    expect(centerY(b)).toBe(19)
  })
})

describe('겹침', () => {
  it('겹치면 참이다', () => {
    expect(overlaps(box(0, 0), box(5, 5))).toBe(true)
  })

  it('떨어져 있으면 거짓이다', () => {
    expect(overlaps(box(0, 0), box(20, 0))).toBe(false)
    expect(overlaps(box(0, 0), box(0, 20))).toBe(false)
  })

  it('면이 정확히 맞닿은 것은 겹침이 아니다', () => {
    // 지면 위에 정확히 서 있는 몸이 매 틱 밀려나는 진동을 막는 규칙이다.
    expect(overlaps(box(0, 0), box(10, 0))).toBe(false)
    expect(overlaps(box(0, 0), box(0, 10))).toBe(false)
    expect(overlaps(box(10, 0), box(0, 0))).toBe(false)
    expect(overlaps(box(0, 10), box(0, 0))).toBe(false)
  })

  it('1px 만 겹쳐도 참이다', () => {
    expect(overlaps(box(0, 0), box(9, 0))).toBe(true)
    expect(overlaps(box(0, 0), box(0, 9))).toBe(true)
  })

  it('한 축만 겹치면 거짓이다', () => {
    expect(overlaps(box(0, 0), box(5, 20))).toBe(false)
  })
})

describe('점 포함', () => {
  it('좌상단은 포함, 우하단은 제외다', () => {
    const b = box(0, 0)
    expect(containsPoint(b, 0, 0)).toBe(true)
    expect(containsPoint(b, 9.9, 9.9)).toBe(true)
    expect(containsPoint(b, 10, 5)).toBe(false)
    expect(containsPoint(b, 5, 10)).toBe(false)
    expect(containsPoint(b, -1, 5)).toBe(false)
    expect(containsPoint(b, 5, -1)).toBe(false)
  })
})

describe('생성 · 이동', () => {
  it('중심으로 만든다', () => {
    expect(fromCenter(10, 10, 4, 6)).toEqual({ x: 8, y: 7, width: 4, height: 6 })
  })

  it('가장자리로 만든다', () => {
    expect(fromEdges(2, 3, 12, 23)).toEqual({ x: 2, y: 3, width: 10, height: 20 })
  })

  it('이동해도 크기는 그대로다', () => {
    const moved = translate(box(0, 0, 12, 26), 5, -3)
    expect(moved).toEqual({ x: 5, y: -3, width: 12, height: 26 })
  })

  it('원본을 바꾸지 않는다', () => {
    const b = box(0, 0)
    translate(b, 10, 10)
    expect(b).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })
})

describe('스윕 범위', () => {
  it('두 위치를 모두 덮는다', () => {
    const swept = sweptBounds(box(0, 0), box(30, 20))
    expect(swept).toEqual({ x: 0, y: 0, width: 40, height: 30 })
  })

  it('역방향 이동도 덮는다', () => {
    const swept = sweptBounds(box(30, 20), box(0, 0))
    expect(swept).toEqual({ x: 0, y: 0, width: 40, height: 30 })
  })

  it('제자리면 원래 상자다', () => {
    expect(sweptBounds(box(5, 5), box(5, 5))).toEqual({ x: 5, y: 5, width: 10, height: 10 })
  })
})
