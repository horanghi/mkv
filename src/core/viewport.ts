import { LOGICAL_HEIGHT, LOGICAL_WIDTH, MAX_SCALE, MIN_SCALE } from './config.ts'

/**
 * 논리 해상도 → 화면 배치 계산.
 *
 * GOAL.md 비협상 원칙 6: **정수 배율만 허용한다.**
 * 비정수 배율에서는 픽셀 크기가 불균등해지는데, 그건 검은 여백보다 나쁘다.
 * 남는 공간은 레터박스(상하) · 필러박스(좌우)로 흘려보낸다.
 */
export interface Viewport {
  /** 정수 배율 */
  readonly scale: number
  /** 캔버스 실제 픽셀 크기 */
  readonly width: number
  readonly height: number
  /** 컨테이너 좌상단 기준 여백 */
  readonly offsetX: number
  readonly offsetY: number
}

export interface ViewportOptions {
  readonly logicalWidth?: number
  readonly logicalHeight?: number
  readonly minScale?: number
  readonly maxScale?: number
}

/**
 * 창 크기에 들어가는 최대 정수 배율을 구한다.
 *
 * 창이 논리 해상도보다 작아도 배율은 `minScale`(기본 1) 아래로 내려가지 않는다.
 * 잘려 보이는 것이 뭉개져 보이는 것보다 낫고, 그 크기는 지원 범위 밖이다.
 */
export function computeScale(
  windowWidth: number,
  windowHeight: number,
  options: ViewportOptions = {},
): number {
  const logicalWidth = options.logicalWidth ?? LOGICAL_WIDTH
  const logicalHeight = options.logicalHeight ?? LOGICAL_HEIGHT
  const minScale = options.minScale ?? MIN_SCALE
  const maxScale = options.maxScale ?? MAX_SCALE

  const fit = Math.floor(Math.min(windowWidth / logicalWidth, windowHeight / logicalHeight))

  return clamp(fit, minScale, maxScale)
}

/** 배율과 레터박스 여백을 함께 계산한다. */
export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  options: ViewportOptions = {},
): Viewport {
  const logicalWidth = options.logicalWidth ?? LOGICAL_WIDTH
  const logicalHeight = options.logicalHeight ?? LOGICAL_HEIGHT

  const scale = computeScale(windowWidth, windowHeight, options)
  const width = logicalWidth * scale
  const height = logicalHeight * scale

  // 여백은 정수로 유지한다. 0.5px 오프셋이 생기면 업스케일 경계에 실선이 낀다.
  return {
    scale,
    width,
    height,
    offsetX: Math.max(0, Math.floor((windowWidth - width) / 2)),
    offsetY: Math.max(0, Math.floor((windowHeight - height) / 2)),
  }
}

/** 화면 좌표(실제 픽셀) → 논리 좌표. 마우스 입력 · 디버그 도구용. */
export function screenToLogical(
  screenX: number,
  screenY: number,
  viewport: Viewport,
): { readonly x: number; readonly y: number } {
  return {
    x: (screenX - viewport.offsetX) / viewport.scale,
    y: (screenY - viewport.offsetY) / viewport.scale,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}
