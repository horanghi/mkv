import type { PlayerBalance } from '../../data/balance.ts'
import { stepGravity } from './movement.ts'

/**
 * 점프 궤도 시뮬레이션.
 *
 * 디버그 오버레이가 궤도를 그릴 때와 캘리브레이션 테스트가 도달 거리를 잴 때
 * **같은 함수**를 쓴다. 화면에 그려진 궤도와 실제 판정이 갈라지면 측정이 무의미해진다.
 *
 * 적분 순서는 `player.ts` 의 한 틱과 정확히 같다 — 속도를 먼저 갱신하고
 * 그 속도로 위치를 옮긴다(semi-implicit Euler). 순서가 다르면 결과가 달라진다.
 */

export interface ArcPoint {
  readonly frame: number
  /** 이륙 지점 기준 상대 좌표. 위가 음수다. */
  readonly x: number
  readonly y: number
}

export interface JumpArc {
  readonly points: readonly ArcPoint[]
  /** 최고 도달 높이(px, 양수) */
  readonly maxHeight: number
  /** 이륙 높이로 돌아올 때까지의 수평 거리(px) */
  readonly distance: number
  readonly airFrames: number
  readonly airSeconds: number
}

export interface ArcOptions {
  /** 이륙 순간의 수평 속도. 기본은 최대 지상 속도. */
  readonly horizontalSpeed?: number
  readonly dt?: number
  readonly maxFrames?: number
}

/**
 * 이륙부터 같은 높이로 돌아올 때까지를 한 프레임씩 돌린다.
 *
 * 공중 가속이 0 이므로 수평 속도는 상수다 — 이것이 고정 궤도의 정의다.
 */
export function simulateJumpArc(balance: PlayerBalance, options: ArcOptions = {}): JumpArc {
  const dt = options.dt ?? 1 / 60
  const vx = options.horizontalSpeed ?? balance.runSpeed
  const maxFrames = options.maxFrames ?? 600

  const points: ArcPoint[] = [{ frame: 0, x: 0, y: 0 }]
  let x = 0
  let y = 0
  let vy = balance.jumpVelocity
  let maxHeight = 0

  // 이륙 틱에는 중력을 먹이지 않는다. 점프 속도를 그대로 싣고 한 틱 움직인다.
  for (let frame = 1; frame <= maxFrames; frame += 1) {
    if (frame > 1) vy = stepGravity(vy, balance, dt)
    x += vx * dt
    y += vy * dt
    maxHeight = Math.max(maxHeight, -y)
    points.push({ frame, x, y })
    if (y >= 0) {
      return {
        points,
        maxHeight,
        distance: x,
        airFrames: frame,
        airSeconds: frame * dt,
      }
    }
  }

  throw new Error('점프가 착지하지 않는다 — 중력 수치를 확인하라')
}

/** 궤도가 통과 가능한 최대 간격을 타일 단위로 환산한다. 레벨 디자인 기준값. */
export function distanceInTiles(arc: JumpArc, tileSize: number): number {
  return arc.distance / tileSize
}
