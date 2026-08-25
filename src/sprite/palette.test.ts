import { describe, expect, it } from 'vitest'
import { PAL_BONE, PAL_FLESH, PAL_RELIC, PAL_STEEL, colorAt, toHexNumber } from './palette.ts'

describe('색 변환', () => {
  it('#RRGGBB 를 정수로 바꾼다 — PixiJS 가 정수 색을 받는다', () => {
    expect(toHexNumber('#0B0710')).toBe(0x0b0710)
    expect(toHexNumber('#FFFFFF')).toBe(0xffffff)
    expect(toHexNumber('#000000')).toBe(0)
  })

  it('팔레트의 모든 색이 정수로 변환된다', () => {
    for (const palette of [PAL_RELIC, PAL_STEEL, PAL_FLESH, PAL_BONE]) {
      for (const color of Object.values(palette)) {
        expect(Number.isNaN(toHexNumber(color))).toBe(false)
      }
    }
  })
})

describe('인덱스 조회', () => {
  it('있는 인덱스는 색을 준다', () => {
    expect(colorAt(PAL_STEEL, '0')).toBe('#0B0710')
    expect(colorAt(PAL_RELIC, '2')).toBe('#F0C04A')
  })

  it('없는 인덱스는 undefined — 그리지 않는다', () => {
    expect(colorAt(PAL_STEEL, 'Z')).toBeUndefined()
    expect(colorAt(PAL_BONE, '2')).toBeUndefined()
  })
})

describe('팔레트 규약', () => {
  it('네 팔레트 모두 아웃라인(0)을 같은 색으로 쓴다', () => {
    for (const palette of [PAL_RELIC, PAL_STEEL, PAL_FLESH, PAL_BONE]) {
      expect(palette['0']).toBe('#0B0710')
    }
  })

  it('갑옷 두 종은 같은 인덱스 집합을 쓴다 — 매트릭스를 공유하기 때문', () => {
    expect(Object.keys(PAL_RELIC).sort()).toEqual(Object.keys(PAL_STEEL).sort())
  })
})
