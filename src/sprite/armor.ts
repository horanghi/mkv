import { PARTS_ARMORED, PARTS_BARE, PARTS_BONE, type PartSet } from './lancel.ts'
import { PAL_BONE, PAL_FLESH, PAL_RELIC, PAL_STEEL, type Palette } from './palette.ts'

/**
 * 갑옷 상태 — 교체 축 두 개를 한 곳에서 묶는다.
 *
 * 성유물과 강철은 **같은 파츠에 팔레트만 다르다.** 속옷과 백골은 파츠까지 바뀐다.
 * 어느 쪽이든 클립은 건드리지 않는다.
 * → docs/02-core-mechanics.md 2.5 · docs/12-sprites.md 12.2
 */

export const ARMOR_STATES = ['relic', 'steel', 'bare', 'bones'] as const
export type ArmorState = (typeof ARMOR_STATES)[number]

const PART_SETS: Readonly<Record<ArmorState, PartSet>> = {
  relic: PARTS_ARMORED,
  steel: PARTS_ARMORED,
  bare: PARTS_BARE,
  bones: PARTS_BONE,
}

const PALETTES: Readonly<Record<ArmorState, Palette>> = {
  relic: PAL_RELIC,
  steel: PAL_STEEL,
  bare: PAL_FLESH,
  bones: PAL_BONE,
}

export function partsFor(state: ArmorState): PartSet {
  return PART_SETS[state]
}

export function paletteFor(state: ArmorState): Palette {
  return PALETTES[state]
}

/** 피격 시 한 단계 강등. 백골은 사망 표현이라 강등 사슬에 없다. */
export function degrade(state: ArmorState): ArmorState | 'dead' {
  if (state === 'relic') return 'steel'
  if (state === 'steel') return 'bare'
  return 'dead'
}
