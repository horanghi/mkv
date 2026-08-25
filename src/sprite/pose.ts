import {
  SPRITE_SIZE,
  blankFrame,
  freezeFrame,
  stamp,
  validateFrame,
  type Matrix,
} from './matrix.ts'
import type { PartSet } from './lancel.ts'
import { WEAPON_MATRICES } from './lancel.ts'

/**
 * 파츠 조립.
 *
 * 프레임마다 도트를 새로 찍지 않는다. 파츠를 오프셋만 바꿔 조립한다.
 * 동작을 늘려도 작업량이 거의 늘지 않는 것이 이 방식의 핵심이다.
 * → docs/12-sprites.md 12.6
 */

export interface Pose {
  /** 전신 상하 */
  readonly dy?: number
  /** 상체(투구·몸통·머리)만 좌우 — 피격 젖힘 */
  readonly lean?: number
  readonly af?: number
  readonly afy?: number
  readonly ab?: number
  readonly aby?: number
  readonly lf?: number
  readonly lfy?: number
  readonly lb?: number
  readonly lby?: number
  /** 두 다리 공통 상하 — 웅크리기·착지 */
  readonly legY?: number
  /** 무기 위치 [x, y]. `attack` 클립에서만 쓴다. */
  readonly wpn?: readonly [number, number]
}

/** 파츠 기준 위치. docs/12.6 의 표와 일치해야 한다. */
export const ANCHORS = {
  PLUME: [4, 2],
  HEAD: [9, 4],
  TORSO: [10, 12],
  ARM_F: [17, 15],
  ARM_B: [8, 15],
  LEG_F: [15, 22],
  LEG_B: [10, 22],
  BOOT_F: [15, 29],
  BOOT_B: [9, 29],
} as const

/**
 * 한 포즈를 32×32 프레임으로 조립한다.
 *
 * 그리는 순서가 곧 깊이다 (뒤 → 앞).
 *   ARM_B → LEG_B → BOOT_B → PLUME → TORSO → HEAD → LEG_F → BOOT_F → ARM_F
 * 순서를 바꾸면 앞팔이 몸통 뒤로 들어간다.
 */
export function pose(parts: PartSet, o: Pose = {}, weaponId?: string): Matrix {
  const {
    dy = 0, lean = 0, af = 0, afy = 0, ab = 0, aby = 0,
    lf = 0, lfy = 0, lb = 0, lby = 0, legY = 0,
  } = o

  const g = blankFrame()

  stamp(g, parts.ARM_B, ANCHORS.ARM_B[0] + ab, ANCHORS.ARM_B[1] + dy + aby)
  stamp(g, parts.LEG_B, ANCHORS.LEG_B[0] + lb, ANCHORS.LEG_B[1] + dy + legY + lby)
  stamp(g, parts.BOOT_B, ANCHORS.BOOT_B[0] + lb, ANCHORS.BOOT_B[1] + dy + legY + lby)
  stamp(g, parts.PLUME, ANCHORS.PLUME[0] + lean, ANCHORS.PLUME[1] + dy)
  stamp(g, parts.TORSO, ANCHORS.TORSO[0] + lean, ANCHORS.TORSO[1] + dy)
  stamp(g, parts.HEAD, ANCHORS.HEAD[0] + lean, ANCHORS.HEAD[1] + dy)
  stamp(g, parts.LEG_F, ANCHORS.LEG_F[0] + lf, ANCHORS.LEG_F[1] + dy + legY + lfy)
  stamp(g, parts.BOOT_F, ANCHORS.BOOT_F[0] + lf, ANCHORS.BOOT_F[1] + dy + legY + lfy)
  stamp(g, parts.ARM_F, ANCHORS.ARM_F[0] + af, ANCHORS.ARM_F[1] + dy + afy)

  // 무기는 attack 클립에서만 나타난다. 평소에는 들고 있지 않다.
  if (o.wpn && weaponId) {
    const weapon = WEAPON_MATRICES[weaponId]
    if (weapon) stamp(g, weapon, o.wpn[0], o.wpn[1] + dy)
  }

  return validateFrame('pose', freezeFrame(g))
}

/**
 * 파츠가 몸통과 겹치는지 검사한다.
 *
 * 그림의 날개, 캐른의 팔, 착지 클립의 뒷팔이 전부 같은 원인으로 떨어져 보였다.
 * 몸통(x10~19)과 최소 1px 겹치지 않으면 파츠가 따로 뜬다.
 * → docs/12-sprites.md 오프셋 유효 범위
 */
const TORSO_SPAN = [ANCHORS.TORSO[0], ANCHORS.TORSO[0] + 9] as const
const LIMB_SPANS = {
  af: [ANCHORS.ARM_F[0], ANCHORS.ARM_F[0] + 3],
  ab: [ANCHORS.ARM_B[0], ANCHORS.ARM_B[0] + 3],
  lf: [ANCHORS.LEG_F[0], ANCHORS.LEG_F[0] + 3],
  lb: [ANCHORS.LEG_B[0], ANCHORS.LEG_B[0] + 3],
} as const

export function detachedLimbs(o: Pose): readonly string[] {
  const detached: string[] = []
  for (const [axis, span] of Object.entries(LIMB_SPANS)) {
    const shift = o[axis as keyof Pose]
    const d = typeof shift === 'number' ? shift : 0
    if (span[0] + d > TORSO_SPAN[1] || span[1] + d < TORSO_SPAN[0]) detached.push(axis)
  }
  return detached
}

export { SPRITE_SIZE }
