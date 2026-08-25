import { nextFloat, type RngState } from '../core/rng.ts'

/**
 * 배경 실루엣 생성.
 *
 * 산맥·성채·나무 윤곽을 시드에서 만든다. 이미지 파일을 쓰지 않는 이유는
 * 초기 로드 8MB 예산 때문이다 — 배경 한 장이 그 예산의 절반을 먹는다.
 * → docs/06-visual-direction.md 6.2, docs/10-tech-spec.md 10.7
 *
 * 순수 함수다. 같은 시드면 같은 능선이 나온다.
 */

export interface RidgeSpec {
  /** 실루엣 한 장의 폭 (px). 이 폭 단위로 가로 반복한다 */
  readonly width: number
  /** 봉우리를 정하는 제어점 수. 적을수록 완만하다 */
  readonly steps: number
  readonly minHeight: number
  readonly maxHeight: number
  /**
   * 들쭉날쭉함 (0~1).
   *
   * 제어점 사이를 부드럽게 잇고 그 위에 얹는 잡음의 크기다.
   * 0 이면 매끈한 언덕, 1 이면 톱니 같은 바위산이 된다.
   */
  readonly jag: number
}

/**
 * 능선 — x 마다의 높이(px) 배열. 길이는 `width` 다.
 *
 * **첫 값과 끝 값을 맞춘다.** 가로로 반복해 이어 붙일 때 이음매가 보이면
 * 배경이 아니라 벽지가 된다.
 */
export function ridgeline(seed: RngState, spec: RidgeSpec): readonly number[] {
  const steps = Math.max(2, Math.trunc(spec.steps))
  const width = Math.max(2, Math.trunc(spec.width))

  // 제어점 높이를 뽑는다. 마지막은 첫 값과 같게 두어 이음매를 없앤다.
  const controls: number[] = []
  let state = seed
  for (let i = 0; i < steps; i += 1) {
    const draw = nextFloat(state)
    state = draw.state
    controls.push(spec.minHeight + draw.value * (spec.maxHeight - spec.minHeight))
  }
  controls.push(controls[0] ?? spec.minHeight)

  const heights: number[] = []
  for (let x = 0; x < width; x += 1) {
    const t = (x / width) * steps
    const index = Math.min(steps - 1, Math.floor(t))
    const frac = t - index
    const a = controls[index] ?? spec.minHeight
    const b = controls[index + 1] ?? spec.minHeight
    const smooth = a + (b - a) * ease(frac)

    const draw = nextFloat(state)
    state = draw.state
    const noise = (draw.value - 0.5) * spec.jag * (spec.maxHeight - spec.minHeight) * 0.35

    heights.push(clamp(smooth + noise, spec.minHeight, spec.maxHeight))
  }

  // 잡음이 양 끝을 벌려 놓았으므로 마지막 몇 px 을 첫 값으로 되돌린다.
  const blend = Math.min(16, Math.floor(width / 4))
  const first = heights[0] ?? spec.minHeight
  for (let i = 0; i < blend; i += 1) {
    const x = width - blend + i
    const weight = (i + 1) / blend
    heights[x] = (heights[x] ?? first) * (1 - weight) + first * weight
  }

  return heights
}

/** smoothstep. 제어점 사이가 각지지 않게 한다. */
function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * 능선을 사각 기둥 목록으로 바꾼다.
 *
 * 픽셀 게임의 배경은 곡선이 아니라 계단이어야 한다. 같은 높이가 이어지는
 * 구간을 하나의 기둥으로 묶어 그리기 호출을 줄인다.
 */
export interface Column {
  readonly x: number
  readonly width: number
  readonly height: number
}

export function columns(heights: readonly number[], step = 2): readonly Column[] {
  if (heights.length === 0) return []

  const out: Column[] = []
  let startX = 0
  let current = quantize(heights[0] ?? 0, step)

  for (let x = 1; x < heights.length; x += 1) {
    const height = quantize(heights[x] ?? 0, step)
    if (height === current) continue
    out.push({ x: startX, width: x - startX, height: current })
    startX = x
    current = height
  }
  out.push({ x: startX, width: heights.length - startX, height: current })
  return out
}

function quantize(value: number, step: number): number {
  return Math.round(value / step) * step
}
