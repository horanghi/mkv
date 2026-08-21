/**
 * 엔진 상수. 게임 밸런스가 아니라 **엔진 규격**만 담는다.
 *
 * 밸런스 수치(속도·데미지·HP)는 `src/data/*.json` 에 있고 런타임에 로드된다.
 * 여기 있는 값은 코드 구조 자체가 의존하므로 상수로 고정한다.
 *
 * 출처: GOAL.md 비협상 원칙 6 · docs/06-visual-direction.md · docs/10-tech-spec.md
 */

/** 논리 해상도. 모든 좌표·히트박스·수치의 기준계다. */
export const LOGICAL_WIDTH = 480
export const LOGICAL_HEIGHT = 270

/** 타일 한 변. 지형은 이 격자에 스냅되고, 파티클·셰이더는 스냅되지 않는다. */
export const TILE_SIZE = 16

/** 논리 해상도를 타일로 환산한 값. 타일맵 질의 범위 계산에 쓴다. */
export const TILES_ACROSS = LOGICAL_WIDTH / TILE_SIZE
export const TILES_DOWN = LOGICAL_HEIGHT / TILE_SIZE

/** 로직 틱. 물리는 이 고정 dt 로만 전진한다 — 결정론의 전제다. */
export const TICK_RATE = 60
export const TICK_MS = 1000 / TICK_RATE
export const TICK_SECONDS = 1 / TICK_RATE

/**
 * 한 프레임에 따라잡을 수 있는 최대 틱 수.
 * 이 상한이 없으면 느린 기기에서 "따라잡으려다 더 느려지는" 죽음의 나선에 빠진다.
 */
export const MAX_CATCHUP_TICKS = 5

/** 렌더 타깃 배율. docs/10-tech-spec.md 10.5 의 표와 일치해야 한다. */
export const LIGHT_RT_SCALE = 1 / 2
export const BLOOM_RT_SCALES = [1 / 2, 1 / 4, 1 / 8] as const

/** 프레임 예산(ms). 초과 시 디버그 오버레이가 경고색으로 표시한다. */
export const FRAME_BUDGET_MS = {
  logic: 4,
  renderPrep: 3,
  gpuScene: 4,
  gpuPost: 4,
} as const

/** 정수 배율 업스케일의 하한·상한. 상한은 4K 에서 8배까지를 상정한다. */
export const MIN_SCALE = 1
export const MAX_SCALE = 8

/** 프레임 수를 초로 환산한다. 문서의 수치가 전부 프레임 단위라 자주 쓴다. */
export function framesToSeconds(frames: number): number {
  return frames * TICK_SECONDS
}

/** 초를 프레임 수로 환산한다. 내림 처리 — 관용 장치는 넉넉한 쪽이 아니라 정확한 쪽이 옳다. */
export function secondsToFrames(seconds: number): number {
  return Math.floor(seconds * TICK_RATE)
}
