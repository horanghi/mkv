import { TILE, setTile, tileFromIndex, tileIndex, type TileCoord, type Tilemap } from './tilemap.ts'

/**
 * 붕괴 타일 타이머.
 *
 * 충돌 해소(`body.ts`)는 순수하게 유지하고, 시간에 따라 변하는 부분만 여기 모은다.
 * `resolve` 가 "밟았다"고 알려주면 여기서 타이머를 돌리고 타일맵을 갱신한다.
 *
 * **호출 순서: `tickCrumble` 을 먼저, `touchCrumbling` 을 나중에.**
 * 반대로 부르면 밟은 그 틱에 타이머가 한 번 깎여 붕괴가 1틱 빨라진다.
 *
 * → docs/04-stages.md STAGE 1 (밟으면 1초 후 붕괴) · docs/10-tech-spec.md 10.4
 */

/** 밟은 뒤 무너지기까지. docs/04 — 1초. */
export const CRUMBLE_DELAY_TICKS = 60

export interface CrumbleState {
  /** 타일 인덱스 → 남은 틱 */
  readonly timers: ReadonlyMap<number, number>
  /** 이미 무너진 타일 인덱스 */
  readonly fallen: ReadonlySet<number>
}

export const INITIAL_CRUMBLE: CrumbleState = Object.freeze({
  timers: new Map<number, number>(),
  fallen: new Set<number>(),
})

export interface CrumbleTick {
  readonly state: CrumbleState
  readonly map: Tilemap
  /** 이번 틱에 무너진 타일. 파편·먼지 연출의 신호다. */
  readonly collapsed: readonly TileCoord[]
}

/**
 * 밟힌 타일의 타이머를 시작한다.
 *
 * 이미 돌고 있는 타이머는 **연장하지 않는다.** 계속 밟고 있다고 유예되면
 * "밟으면 무너진다"는 약속이 깨진다.
 */
export function touchCrumbling(
  state: CrumbleState,
  map: Tilemap,
  touched: readonly TileCoord[],
  delayTicks: number = CRUMBLE_DELAY_TICKS,
): CrumbleState {
  const fresh = touched
    .map((c) => tileIndex(map, c.tx, c.ty))
    .filter((index) => !state.timers.has(index) && !state.fallen.has(index))

  if (fresh.length === 0) return state

  const timers = new Map(state.timers)
  for (const index of fresh) timers.set(index, delayTicks)
  return { ...state, timers }
}

/** 타이머를 한 틱 진행한다. 0 에 닿은 타일은 타일맵에서 사라진다. */
export function tickCrumble(state: CrumbleState, map: Tilemap): CrumbleTick {
  if (state.timers.size === 0) return { state, map, collapsed: [] }

  const timers = new Map<number, number>()
  const collapsedIndices: number[] = []

  for (const [index, remaining] of state.timers) {
    const next = remaining - 1
    if (next > 0) timers.set(index, next)
    else collapsedIndices.push(index)
  }

  if (collapsedIndices.length === 0) {
    return { state: { ...state, timers }, map, collapsed: [] }
  }

  const fallen = new Set(state.fallen)
  let nextMap = map
  const collapsed: TileCoord[] = []

  for (const index of collapsedIndices) {
    fallen.add(index)
    const coord = tileFromIndex(map, index)
    collapsed.push(coord)
    nextMap = setTile(nextMap, coord.tx, coord.ty, TILE.empty)
  }

  return { state: { timers, fallen }, map: nextMap, collapsed }
}

/**
 * 시각 경고 진행도 [0, 1].
 *
 * 0 은 방금 밟음, 1 은 무너지기 직전이다. 렌더가 이 값으로 흔들림을 키운다.
 * 경고는 **접촉 즉시** 시작한다 — 플레이어가 다음 점프를 결정하기 전에 보여야 한다.
 */
export function warningProgress(
  state: CrumbleState,
  map: Tilemap,
  tx: number,
  ty: number,
  delayTicks: number = CRUMBLE_DELAY_TICKS,
): number {
  const remaining = state.timers.get(tileIndex(map, tx, ty))
  if (remaining === undefined) return 0
  return 1 - remaining / delayTicks
}

export function isFallen(state: CrumbleState, map: Tilemap, tx: number, ty: number): boolean {
  return state.fallen.has(tileIndex(map, tx, ty))
}

/**
 * 무너진 타일은 되살아나지 않는다.
 *
 * 재생성 규칙은 문서에 없다. 사망 시 스테이지가 다시 로드되므로 진행이 막히지도 않는다.
 * M1 레벨 디자인에서 필요해지면 그때 넣는다 — 지금 넣으면 검증되지 않은 규칙이 된다.
 */
export function resetCrumble(): CrumbleState {
  return { timers: new Map(), fallen: new Set() }
}
