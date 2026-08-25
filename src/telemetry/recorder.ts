import type { DamageCause } from '../game/world.ts'
import { pushFrame } from './frames.ts'
import {
  NEW_SESSION, noteArmorBreak, noteBossReached, noteClear, noteControlBack,
  noteDeath, noteFrame, noteHurt, noteInput, observe, type Session,
} from './session.ts'

/**
 * 월드에서 일어난 일을 세션 계측으로 옮긴다.
 *
 * 여기에 있는 이유: `main.ts` 에 두면 테스트가 안 된다. 전이 판정(죽었다가
 * 살아났다, 처음 클리어했다)은 이전 프레임과 비교해야 하는데, 그게 틀리면
 * 지표가 조용히 거짓이 된다.
 */

export interface RecorderState {
  readonly session: Session
  /** 직전 프레임에 죽어 있었는가. 조작 복귀 시점을 잡는 데 쓴다. */
  readonly wasDead: boolean
  readonly wasCleared: boolean
}

export const NEW_RECORDER: RecorderState = Object.freeze({
  session: NEW_SESSION,
  wasDead: false,
  wasCleared: false,
})

export function resume(session: Session): RecorderState {
  return { ...NEW_RECORDER, session }
}

/** 이번 프레임의 관측값. 월드 타입을 통째로 받지 않아 테스트가 가볍다. */
export interface Observation {
  /** 세션 시작으로부터의 경과 (ms) */
  readonly nowMs: number
  readonly frameMs: number
  readonly dead: boolean
  readonly playerX: number
  readonly cleared: boolean
  readonly bossAwake: boolean
  /** 이번 프레임에 조작 입력이 하나라도 있었는가 */
  readonly pressed: boolean
  /**
   * 이번 프레임 안에서 부활이 일어났는가.
   *
   * 한 프레임에 여러 틱이 돌기 때문에 프레임 앞뒤만 비교하면 놓친다 —
   * 부활 틱과 사망 틱이 같은 프레임에 들어오면 둘 다 안 보인다.
   * 호출부가 틱 단위로 보고한다.
   */
  readonly respawned: boolean
  readonly died: boolean
  readonly hurt: boolean
  readonly armorBroke: boolean
  readonly cause: DamageCause | null
}

export function record(state: RecorderState, o: Observation): RecorderState {
  let session = noteFrame(state.session, pushFrame(state.session.frames, o.frameMs), o.nowMs)

  // 순서가 규칙이다. **복귀 → 입력 → 사망.**
  //
  // 복귀와 입력은 *직전* 사망에 붙는 것이므로 새 사망을 밀어 넣기 전에 처리해야
  // 한다. 사망을 먼저 처리하면 같은 프레임에 부활과 사망이 겹칠 때 조작 복귀가
  // 방금 생긴 사망에 잘못 붙는다.
  //
  // 복귀가 입력보다 먼저인 이유는 따로 있다 — 부활 프레임에 이미 눌려 있던
  // 키를 재시도로 잡으려면 창이 먼저 열려 있어야 한다.
  if (o.respawned || (state.wasDead && !o.dead)) session = noteControlBack(session, o.nowMs)
  if (o.pressed) session = noteInput(session, o.nowMs)
  if (o.died) session = noteDeath(session, o.playerX, o.cause, o.nowMs)
  if (o.hurt) session = noteHurt(session)
  if (o.armorBroke) session = noteArmorBreak(session)
  if (o.bossAwake) session = noteBossReached(session)
  if (o.cleared && !state.wasCleared) session = noteClear(session, o.nowMs)

  return {
    session: observe(session, o.nowMs),
    wasDead: o.dead,
    wasCleared: o.cleared,
  }
}
