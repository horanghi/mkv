import { jumpFrame, type ClipName, type ClipState } from '../../sprite/clip.ts'
import { isBusy } from './attack.ts'
import type { Player } from './player.ts'

/**
 * 플레이어 상태 → 클립.
 *
 * 갑옷 상태는 여기 들어오지 않는다. 클립은 네 상태가 공유하므로
 * 갑옷이 바뀌어도 재생 중인 프레임은 그대로다.
 * → docs/12-sprites.md 12.6
 */

/**
 * 우선순위가 곧 규칙이다.
 *   피격 > 공격 > 공중 > 착지 > 웅크리기 > 걷기 > 대기
 *
 * 피격이 가장 위인 것은 **맞았다는 사실이 가장 먼저 읽혀야** 하기 때문이다.
 * 공격이 그다음인 것은 후딜 중에도 이동이 되기 때문이다 —
 * 걷는 동안에도 던지는 동작이 보여야 한다.
 */
export function nextClip(player: Player, current: ClipState): ClipName {
  // 피격 클립은 단발이다. 시작했으면 무엇도 끊지 못한다.
  if (current.name === 'hurt' && !current.finished) return 'hurt'
  if (isBusy(player.attack)) return 'attack'
  if (!player.body.onGround) return 'jump'
  if (player.landed) return 'land'
  // 착지 클립은 단발이다. 시작했으면 끝까지 재생한다.
  if (current.name === 'land' && !current.finished) return 'land'
  if (player.crouching) return 'crouch'
  return Math.abs(player.body.vx) > 1 ? 'walk' : 'idle'
}

/**
 * 점프 클립은 시간이 아니라 물리가 프레임을 고른다.
 * 다른 클립은 재생 상태의 프레임을 그대로 쓴다.
 */
export function frameFor(player: Player, state: ClipState): number {
  if (state.name !== 'jump') return state.frame
  return jumpFrame(player.body.vy)
}
