import { describe, expect, it } from 'vitest'
import { ARMOR_STATES, degrade, paletteFor, partsFor } from './armor.ts'
import { PARTS_ARMORED, PARTS_BARE, PARTS_BONE } from './lancel.ts'
import { PAL_RELIC, PAL_STEEL, missingIndices } from './palette.ts'
import { CLIPS } from './clip.ts'
import { pose } from './pose.ts'

describe('교체 축', () => {
  it('성유물과 강철은 같은 파츠에 팔레트만 다르다', () => {
    expect(partsFor('relic')).toBe(partsFor('steel'))
    expect(paletteFor('relic')).not.toBe(paletteFor('steel'))
  })

  it('속옷과 백골은 파츠까지 바뀐다', () => {
    expect(partsFor('bare')).toBe(PARTS_BARE)
    expect(partsFor('bones')).toBe(PARTS_BONE)
    expect(partsFor('steel')).toBe(PARTS_ARMORED)
  })

  it('네 상태 모두 팔레트가 있다', () => {
    for (const state of ARMOR_STATES) {
      expect(Object.keys(paletteFor(state)).length).toBeGreaterThan(0)
    }
  })
})

describe('강등', () => {
  it('성유물 → 강철 → 속옷 → 사망', () => {
    expect(degrade('relic')).toBe('steel')
    expect(degrade('steel')).toBe('bare')
    expect(degrade('bare')).toBe('dead')
  })

  it('백골은 강등 사슬에 없다 — 사망 표현이다', () => {
    expect(degrade('bones')).toBe('dead')
  })
})

describe('팔레트 정합성', () => {
  it('모든 상태의 모든 클립 프레임이 팔레트로 전부 칠해진다', () => {
    // 인덱스가 팔레트에 없으면 그 픽셀이 조용히 사라진다.
    const problems: string[] = []
    for (const state of ARMOR_STATES) {
      const parts = partsFor(state)
      const palette = paletteFor(state)
      for (const [name, clip] of Object.entries(CLIPS)) {
        clip.keys.forEach((key, i) => {
          const missing = missingIndices(pose(parts, key), palette)
          if (missing.length > 0) problems.push(`${state}/${name} f${i}: ${missing.join(',')}`)
        })
      }
    }
    expect(problems).toEqual([])
  })

  it('없는 인덱스를 찾아낸다', () => {
    expect(missingIndices(['0Z'], PAL_STEEL)).toEqual(['Z'])
    expect(missingIndices(['012'], PAL_RELIC)).toEqual([])
  })

  it('투명은 인덱스로 세지 않는다', () => {
    expect(missingIndices(['..'], {})).toEqual([])
  })
})
