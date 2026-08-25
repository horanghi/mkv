import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/config.ts'

/**
 * 추적 카메라.
 *
 * 데드존 + 부드러운 보간. 플레이어를 화면 정중앙에 고정하면 작은 움직임마다
 * 배경이 흔들려 눈이 피로해진다. 데드존 안에서는 카메라가 가만히 있는다.
 * → docs/06-visual-direction.md 6.5
 */

export interface Camera {
  readonly x: number
  readonly y: number
  /**
   * 현재 적용 중인 선행량. 데드존 추적과 **따로** 보간한다.
   *
   * 선행을 데드존 목표에 더하면 둘이 곱해져 실제 선행이 두 배가 된다.
   * 데드존이 선행만큼 더 밀리고, 그 위에 선행이 또 붙기 때문이다.
   */
  readonly lead: number
}

export const CAMERA = {
  deadzoneWidth: 64,
  deadzoneHeight: 40,
  lerp: 0.12,
  /** 이동 방향으로 미리 보여주는 거리 */
  lookAhead: 32,
  /** 낙하 중 세로 데드존을 넓혀 착지점을 미리 보여준다. */
  fallDeadzoneScale: 2.2,
} as const

export interface CameraTarget {
  readonly x: number
  readonly y: number
  /** 이동 방향 [-1, 1]. 선행 방향을 정한다. */
  readonly facing: number
  readonly falling: boolean
}

export interface CameraBounds {
  readonly width: number
  readonly height: number
}

export function createCamera(x = 0, y = 0): Camera {
  return { x, y, lead: 0 }
}

/**
 * 한 틱.
 *
 * 데드존을 벗어난 만큼만 목표를 옮기고, 거기로 부드럽게 따라간다.
 * 선행은 목표에 더한다 — 달리는 방향이 더 넓게 보인다.
 */
export function stepCamera(
  camera: Camera,
  target: CameraTarget,
  bounds: CameraBounds,
  lerp: number = CAMERA.lerp,
): Camera {
  const halfW = LOGICAL_WIDTH / 2
  const halfH = LOGICAL_HEIGHT / 2

  const centerY = camera.y + halfH

  const deadX = CAMERA.deadzoneWidth / 2
  // 떨어지는 동안 세로 데드존을 넓힌다. 카메라가 따라 내려가면
  // 착지점이 화면 밖에 있어 어디에 떨어질지 알 수 없다.
  const deadY = (CAMERA.deadzoneHeight / 2) * (target.falling ? CAMERA.fallDeadzoneScale : 1)

  // 데드존 추적 — 선행을 뺀 순수 위치를 기준으로 센다.
  const trackedX = camera.x - camera.lead
  const trackedCenterX = trackedX + halfW

  const wantX = trackedCenterX + clampOutside(target.x - trackedCenterX, deadX)
  const wantY = centerY + clampOutside(target.y - centerY, deadY)

  const nextTrackedX = trackedX + (wantX - halfW - trackedX) * lerp
  const nextY = camera.y + (wantY - halfH - camera.y) * lerp
  const lead = camera.lead + (target.facing * CAMERA.lookAhead - camera.lead) * lerp

  return {
    x: clamp(nextTrackedX + lead, 0, Math.max(0, bounds.width - LOGICAL_WIDTH)),
    y: clamp(nextY, 0, Math.max(0, bounds.height - LOGICAL_HEIGHT)),
    lead,
  }
}

/** 즉시 이동. 리스폰·체크포인트 복귀에 쓴다 — 보간하면 3초 예산을 먹는다. */
export function snapCamera(target: CameraTarget, bounds: CameraBounds): Camera {
  return {
    x: clamp(target.x - LOGICAL_WIDTH / 2, 0, Math.max(0, bounds.width - LOGICAL_WIDTH)),
    y: clamp(target.y - LOGICAL_HEIGHT / 2, 0, Math.max(0, bounds.height - LOGICAL_HEIGHT)),
    lead: 0,
  }
}

/** 화면에 보이는 영역. 그림의 "화면 안에서만 깨어난다" 판정에 쓴다. */
export function viewOf(camera: Camera): {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
} {
  return { x: camera.x, y: camera.y, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT }
}

/** 데드존 밖으로 나간 만큼만 남긴다. 안쪽은 0 이다. */
function clampOutside(delta: number, dead: number): number {
  if (delta > dead) return delta - dead
  if (delta < -dead) return delta + dead
  return 0
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}
