import type { PlayerBalance } from '../../data/balance.ts'

/**
 * 수평 이동과 중력 — 순수 함수.
 *
 * 수치는 전부 `docs/02-core-mechanics.md` 2.2, 2.3 이고 `src/data/player.json` 에 있다.
 * 여기에 상수를 쓰지 않는다.
 */

/** `rate` 의 속도로 `target` 에 다가간다. 넘어서지 않는다. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const delta = target - current
  const step = Math.abs(rate) * dt
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}

/**
 * 수평 속도 갱신.
 *
 * **공중에서는 방향 전환이 되지 않는다.** `airAccel` 이 0 이므로 이륙 순간의
 * 수평 속도가 착지까지 그대로 유지된다. 이것이 이 게임의 정체성이다 —
 * "뛰기 전에 읽는다"는 사고 루프가 전부 이 규칙 위에 서 있다.
 * → GOAL.md 비협상 원칙 1
 */
export function stepHorizontal(
  vx: number,
  axis: -1 | 0 | 1,
  grounded: boolean,
  crouching: boolean,
  balance: PlayerBalance,
  dt: number,
  /** 갑옷 상태 보정. 속옷은 1.08 이다 — 공포 보정. → docs/02 2.5 */
  speedScale = 1,
): number {
  const top = balance.runSpeed * speedScale
  if (!grounded) return approach(vx, axis * top, balance.airAccel, dt)

  // 웅크린 채로는 걷지 않는다. 웅크리기를 확실한 선택으로 만든다.
  const target = crouching ? 0 : axis * top
  const rate = target === 0 ? balance.decel : balance.accel
  return approach(vx, target, rate, dt)
}

/**
 * 중력 갱신.
 *
 * 하강 중력이 상승보다 크다(1750 대 1500). 올라갈 때는 시원하고 떨어질 때는
 * 묵직한 감각이 여기서 나온다. → docs/02 2.3
 */
export function stepGravity(vy: number, balance: PlayerBalance, dt: number): number {
  const gravity = vy < 0 ? balance.gravityRising : balance.gravityFalling
  return Math.min(balance.maxFallSpeed, vy + gravity * dt)
}
