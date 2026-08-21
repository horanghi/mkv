import { describe, expect, it } from 'vitest'
import {
  CRUMBLE_DELAY_TICKS,
  INITIAL_CRUMBLE,
  isFallen,
  resetCrumble,
  tickCrumble,
  touchCrumbling,
  warningProgress,
  type CrumbleState,
} from './crumble.ts'
import { TILE, parseTilemap, tileAt, type Tilemap } from './tilemap.ts'

const MAP: Tilemap = parseTilemap([
  '.xx.',
  '####',
])

const AT = { tx: 1, ty: 0 } as const
const OTHER = { tx: 2, ty: 0 } as const

function advance(state: CrumbleState, map: Tilemap, ticks: number) {
  let current = { state, map }
  let collapsed = 0
  for (let i = 0; i < ticks; i += 1) {
    const next = tickCrumble(current.state, current.map)
    current = { state: next.state, map: next.map }
    collapsed += next.collapsed.length
  }
  return { ...current, collapsed }
}

describe('타이머 시작', () => {
  it('밟으면 타이머가 걸린다', () => {
    const state = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    expect(state.timers.size).toBe(1)
    expect(warningProgress(state, MAP, AT.tx, AT.ty)).toBe(0)
  })

  it('밟지 않은 타일은 진행도가 0 이다', () => {
    const state = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    expect(warningProgress(state, MAP, OTHER.tx, OTHER.ty)).toBe(0)
  })

  it('빈 접촉 목록이면 같은 상태를 돌려준다', () => {
    expect(touchCrumbling(INITIAL_CRUMBLE, MAP, [])).toBe(INITIAL_CRUMBLE)
  })

  it('계속 밟고 있어도 유예되지 않는다', () => {
    // 연장되면 "밟으면 무너진다"는 약속이 깨진다.
    let state = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    const half = advance(state, MAP, 30)
    state = touchCrumbling(half.state, half.map, [AT])
    expect(warningProgress(state, MAP, AT.tx, AT.ty)).toBeCloseTo(0.5)
  })

  it('이미 무너진 타일은 다시 걸리지 않는다', () => {
    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    const done = advance(touched, MAP, CRUMBLE_DELAY_TICKS)
    const again = touchCrumbling(done.state, done.map, [AT])
    expect(again.timers.size).toBe(0)
  })

  it('여러 타일을 동시에 건다', () => {
    const state = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT, OTHER])
    expect(state.timers.size).toBe(2)
  })
})

describe('붕괴', () => {
  it('1초(60틱) 뒤에 사라진다 — docs/04', () => {
    expect(CRUMBLE_DELAY_TICKS).toBe(60)

    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    const before = advance(touched, MAP, CRUMBLE_DELAY_TICKS - 1)
    expect(tileAt(before.map, AT.tx, AT.ty)).toBe(TILE.crumbling)

    const after = advance(touched, MAP, CRUMBLE_DELAY_TICKS)
    expect(tileAt(after.map, AT.tx, AT.ty)).toBe(TILE.empty)
    expect(after.collapsed).toBe(1)
  })

  it('무너진 타일을 기록한다', () => {
    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    const after = advance(touched, MAP, CRUMBLE_DELAY_TICKS)
    expect(isFallen(after.state, MAP, AT.tx, AT.ty)).toBe(true)
    expect(isFallen(after.state, MAP, OTHER.tx, OTHER.ty)).toBe(false)
  })

  it('무너지는 순간 좌표를 알려준다 — 파편 연출의 신호', () => {
    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    let current = { state: touched, map: MAP }
    for (let i = 0; i < CRUMBLE_DELAY_TICKS - 1; i += 1) {
      const next = tickCrumble(current.state, current.map)
      current = { state: next.state, map: next.map }
    }
    const last = tickCrumble(current.state, current.map)
    expect(last.collapsed).toEqual([AT])
  })

  it('다른 타일은 건드리지 않는다', () => {
    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    const after = advance(touched, MAP, CRUMBLE_DELAY_TICKS)
    expect(tileAt(after.map, OTHER.tx, OTHER.ty)).toBe(TILE.crumbling)
    expect(tileAt(after.map, 0, 1)).toBe(TILE.solid)
  })

  it('타이머가 없으면 아무것도 하지 않는다', () => {
    const result = tickCrumble(INITIAL_CRUMBLE, MAP)
    expect(result.state).toBe(INITIAL_CRUMBLE)
    expect(result.map).toBe(MAP)
    expect(result.collapsed).toEqual([])
  })

  it('무너지지 않은 틱에서는 맵이 그대로다', () => {
    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    const result = tickCrumble(touched, MAP)
    expect(result.map).toBe(MAP)
    expect(result.collapsed).toEqual([])
  })
})

describe('호출 순서', () => {
  it('틱을 먼저 돌리고 접촉을 등록하면 정확히 60틱 뒤에 무너진다', () => {
    // 반대로 부르면 밟은 틱에 타이머가 한 번 깎여 1틱 빨라진다.
    let state = INITIAL_CRUMBLE
    let map = MAP
    let fellAt = -1

    for (let tick = 0; tick < 200; tick += 1) {
      const ticked = tickCrumble(state, map)
      state = ticked.state
      map = ticked.map
      if (ticked.collapsed.length > 0) fellAt = tick

      // 10틱째에 밟는다.
      if (tick === 10) state = touchCrumbling(state, map, [AT])
    }

    expect(fellAt).toBe(10 + CRUMBLE_DELAY_TICKS)
  })
})

describe('시각 경고', () => {
  it('접촉 즉시 0 에서 시작해 붕괴 직전 1 에 닿는다', () => {
    // 플레이어가 다음 점프를 결정하기 전에 경고가 보여야 한다.
    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    expect(warningProgress(touched, MAP, AT.tx, AT.ty)).toBe(0)

    const mid = advance(touched, MAP, 45)
    expect(warningProgress(mid.state, MAP, AT.tx, AT.ty)).toBeCloseTo(0.75)

    const almost = advance(touched, MAP, CRUMBLE_DELAY_TICKS - 1)
    expect(warningProgress(almost.state, MAP, AT.tx, AT.ty)).toBeCloseTo(1 - 1 / 60)
  })
})

describe('불변성 · 초기화', () => {
  it('원본 상태와 맵을 바꾸지 않는다', () => {
    const touched = touchCrumbling(INITIAL_CRUMBLE, MAP, [AT])
    advance(touched, MAP, CRUMBLE_DELAY_TICKS)
    expect(INITIAL_CRUMBLE.timers.size).toBe(0)
    expect(touched.timers.size).toBe(1)
    expect(tileAt(MAP, AT.tx, AT.ty)).toBe(TILE.crumbling)
  })

  it('초기화하면 비어 있다', () => {
    const fresh = resetCrumble()
    expect(fresh.timers.size).toBe(0)
    expect(fresh.fallen.size).toBe(0)
  })
})
