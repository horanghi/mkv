import { describe, expect, it } from 'vitest'
import type { Aabb } from '../../physics/aabb.ts'
import {
  CHEST_SIZE, ITEM_RISE_FRAMES,
  boxOfChest, boxOfItem, createChest, stepChest, strikeChest, takeChest,
} from './chest.ts'

const SPEAR: Aabb = { x: 0, y: 0, width: 10, height: 2 }

function chest() {
  return createChest(1, 10, 15, { kind: 'weapon', weaponId: 'dagger' })
}

/** 상자 위에 겹치는 상자를 만든다. */
function over(target: ReturnType<typeof chest>): Aabb {
  const box = boxOfChest(target)
  return { x: box.x + 2, y: box.y + 2, width: 6, height: 6 }
}

describe('보물상자', () => {
  it('타일 좌표에 놓이고 바닥에 붙는다', () => {
    const box = boxOfChest(chest())
    expect(box.x).toBe(160)
    expect(box.y + box.height).toBe(15 * 16 + 16)
  })

  it('창 궤도에 닿는 높이다 — 안 맞으면 없는 물건이다', () => {
    // 창은 랜슬 위쪽 1/3 높이로 날아간다 (실측: 몸 위에서 9~11px).
    // 상자 윗면이 그보다 낮으면 그냥 지나친다.
    const box = boxOfChest(chest())
    const groundY = box.y + box.height
    const spearTop = groundY - 26 + 9
    const spearBottom = groundY - 26 + 11

    expect(box.y).toBeLessThan(spearTop)
    expect(box.y + box.height).toBeGreaterThan(spearBottom)
  })

  it('때리면 열린다', () => {
    const opened = strikeChest(chest(), over(chest()))
    expect(opened.state).toBe('open')
  })

  it('빗나가면 안 열린다', () => {
    const miss = strikeChest(chest(), { ...SPEAR, x: 9999, y: 9999 })
    expect(miss.state).toBe('closed')
  })

  it('이미 연 상자는 다시 열리지 않는다 — 또 나오면 무기 선택이 의미를 잃는다', () => {
    const opened = strikeChest(chest(), over(chest()))
    expect(strikeChest(opened, over(chest()))).toBe(opened)

    const taken = { ...opened, state: 'taken' as const }
    expect(strikeChest(taken, over(chest()))).toBe(taken)
  })

  it('닫혀 있으면 내용물이 없다', () => {
    expect(boxOfItem(chest())).toBeNull()
  })

  it('열리면 내용물이 떠오른다', () => {
    let c = strikeChest(chest(), over(chest()))
    const start = boxOfItem(c)!.y
    for (let i = 0; i < ITEM_RISE_FRAMES; i += 1) c = stepChest(c)
    const end = boxOfItem(c)!.y

    expect(end).toBeLessThan(start)
    expect(c.openFrames).toBe(ITEM_RISE_FRAMES)
  })

  it('다 떠오르면 더 안 올라간다', () => {
    let c = strikeChest(chest(), over(chest()))
    for (let i = 0; i < ITEM_RISE_FRAMES + 20; i += 1) c = stepChest(c)
    expect(c.openFrames).toBe(ITEM_RISE_FRAMES)
  })

  it('닫힌 상자는 시간이 흘러도 그대로다', () => {
    const c = chest()
    expect(stepChest(c)).toBe(c)
  })

  it('다 떠오른 뒤에만 주울 수 있다 — 열자마자 집히면 선택이 아니다', () => {
    let c = strikeChest(chest(), over(chest()))
    const playerBox: Aabb = { x: c.x, y: c.y - 20, width: CHEST_SIZE.width, height: 26 }

    expect(takeChest(c, playerBox).taken).toBeNull()

    for (let i = 0; i < ITEM_RISE_FRAMES; i += 1) c = stepChest(c)
    const result = takeChest(c, playerBox)

    expect(result.taken).toEqual({ kind: 'weapon', weaponId: 'dagger' })
    expect(result.chest.state).toBe('taken')
  })

  it('멀리 있으면 못 줍는다', () => {
    let c = strikeChest(chest(), over(chest()))
    for (let i = 0; i < ITEM_RISE_FRAMES; i += 1) c = stepChest(c)

    expect(takeChest(c, { x: 9999, y: 9999, width: 12, height: 26 }).taken).toBeNull()
  })

  it('한 번 주우면 다시 못 줍는다', () => {
    let c = strikeChest(chest(), over(chest()))
    for (let i = 0; i < ITEM_RISE_FRAMES; i += 1) c = stepChest(c)
    const playerBox: Aabb = { x: c.x, y: c.y - 20, width: CHEST_SIZE.width, height: 26 }

    const first = takeChest(c, playerBox)
    expect(first.taken).not.toBeNull()
    expect(takeChest(first.chest, playerBox).taken).toBeNull()
  })

  it('성유물 상자도 같은 규칙이다', () => {
    let c = createChest(2, 5, 15, { kind: 'relic', relic: 'gold' })
    c = strikeChest(c, over(c))
    for (let i = 0; i < ITEM_RISE_FRAMES; i += 1) c = stepChest(c)
    const playerBox: Aabb = { x: c.x, y: c.y - 20, width: CHEST_SIZE.width, height: 26 }

    expect(takeChest(c, playerBox).taken).toEqual({ kind: 'relic', relic: 'gold' })
  })

  it('원본을 바꾸지 않는다', () => {
    const before = chest()
    strikeChest(before, over(before))
    stepChest(before)
    expect(before.state).toBe('closed')
    expect(before.openFrames).toBe(0)
  })
})
