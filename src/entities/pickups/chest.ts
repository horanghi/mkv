import type { Aabb } from '../../physics/aabb.ts'
import { overlaps } from '../../physics/aabb.ts'
import type { RelicKind } from '../player/vitals.ts'

/**
 * 보물상자.
 *
 * 원작 문법 그대로다 — **때려서 열고, 나온 것을 밟아 줍는다.**
 * 열자마자 자동으로 주면 "선택"이 사라진다. 지금 쓰는 무기를 버릴지
 * 말지가 이 게임의 작은 결정이고, 그건 줍는 순간에 일어나야 한다.
 * → docs/03 3.1 "선택은 되돌릴 수 있다" · docs/04 4.4
 */

export type ChestContents =
  | { readonly kind: 'weapon'; readonly weaponId: string }
  | { readonly kind: 'relic'; readonly relic: RelicKind }

export type ChestState = 'closed' | 'open' | 'taken'

export interface Chest {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly contents: ChestContents
  readonly state: ChestState
  /** 열린 뒤 흐른 프레임. 내용물이 떠오르는 연출에 쓴다 */
  readonly openFrames: number
}

/**
 * 상자 크기.
 *
 * **높이는 창 궤도에 닿아야 정해진다.** 14px 로 뒀더니 윗면이 창보다 1px
 * 낮아 그냥 지나쳤다 — 때려서 여는 물건이 안 맞으면 존재하지 않는 것과 같다.
 * 랜슬 키(26px)의 3/4 쯤이라 시각적으로도 상자로 읽힌다.
 */
export const CHEST_SIZE = { width: 16, height: 20 } as const
/** 열리고 나온 내용물의 크기. 상자보다 작아 밟기 쉽다 */
export const ITEM_SIZE = { width: 12, height: 12 } as const
/** 내용물이 떠오르는 높이 (px). 상자 위로 뜬다 */
export const ITEM_RISE = 12
/** 떠오르는 데 걸리는 프레임 */
export const ITEM_RISE_FRAMES = 12

export function createChest(
  id: number,
  tx: number,
  ty: number,
  contents: ChestContents,
  tileSize = 16,
): Chest {
  return {
    id,
    x: tx * tileSize,
    y: ty * tileSize + (tileSize - CHEST_SIZE.height),
    contents,
    state: 'closed',
    openFrames: 0,
  }
}

export function boxOfChest(chest: Chest): Aabb {
  return { x: chest.x, y: chest.y, width: CHEST_SIZE.width, height: CHEST_SIZE.height }
}

/** 열린 상자에서 떠오른 내용물의 상자. 닫혀 있거나 이미 주웠으면 null. */
export function boxOfItem(chest: Chest): Aabb | null {
  if (chest.state !== 'open') return null

  const progress = Math.min(1, chest.openFrames / ITEM_RISE_FRAMES)
  return {
    x: chest.x + (CHEST_SIZE.width - ITEM_SIZE.width) / 2,
    y: chest.y - ITEM_RISE * progress,
    width: ITEM_SIZE.width,
    height: ITEM_SIZE.height,
  }
}

/**
 * 때려서 연다.
 *
 * 이미 열렸거나 주운 상자는 반응하지 않는다 — 다시 때려서 또 나오면
 * 무기 선택이 의미를 잃는다.
 */
export function strikeChest(chest: Chest, box: Aabb): Chest {
  if (chest.state !== 'closed') return chest
  if (!overlaps(boxOfChest(chest), box)) return chest
  return { ...chest, state: 'open', openFrames: 0 }
}

/** 한 틱. 떠오르는 연출만 진행한다. */
export function stepChest(chest: Chest): Chest {
  if (chest.state !== 'open') return chest
  if (chest.openFrames >= ITEM_RISE_FRAMES) return chest
  return { ...chest, openFrames: chest.openFrames + 1 }
}

/**
 * 밟아서 줍는다.
 *
 * **다 떠오른 뒤에만 주울 수 있다.** 여는 순간 발밑에 있으면 고를 새도 없이
 * 집어지는데, 그건 선택이 아니다.
 */
export function takeChest(chest: Chest, playerBox: Aabb): {
  readonly chest: Chest
  readonly taken: ChestContents | null
} {
  if (chest.state !== 'open' || chest.openFrames < ITEM_RISE_FRAMES) {
    return { chest, taken: null }
  }
  const item = boxOfItem(chest)
  if (!item || !overlaps(item, playerBox)) return { chest, taken: null }

  return { chest: { ...chest, state: 'taken' }, taken: chest.contents }
}
