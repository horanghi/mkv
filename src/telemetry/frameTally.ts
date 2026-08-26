import type { DamageCause, WorldEvents } from '../game/world.ts'

/**
 * 한 프레임 안에서 일어난 틱들을 계측용 관측값 하나로 접는다.
 *
 * 왜 따로 있는가: 한 프레임에 여러 틱이 돈다. 프레임 앞뒤만 비교하면
 * **부활한 틱과 다시 죽은 틱이 같은 프레임에 들어올 때 둘 다 안 보인다.**
 * 그러면 가장 몰입한 행동(부활하자마자 다시 붙는 것)이 이탈로 세어져
 * 재시도율이 뒤집힌다. → prompts/m1-gate.md
 *
 * 이 접기가 `main.ts` 안에 있으면 테스트할 수 없다. 게이트가 읽는 여섯 숫자
 * 중 넷이 여기를 지나가므로, 여기가 조용히 틀리면 테스터 다섯의 기록이
 * 통째로 거짓이 된다.
 */

export interface FrameTally {
  readonly died: boolean
  readonly hurt: boolean
  readonly armorBroke: boolean
  /** 이번 프레임 안에서 부활이 일어났는가. 틱 단위로만 보인다. */
  readonly respawned: boolean
  /** 마지막으로 관측된 사인. 없으면 null */
  readonly cause: DamageCause | null
}

export const EMPTY_TALLY: FrameTally = Object.freeze({
  died: false, hurt: false, armorBroke: false, respawned: false, cause: null,
})

/**
 * 틱 하나를 접어 넣는다.
 *
 * `deadBefore` 는 `stepWorld` 를 부르기 **전**의 사망 여부다. 부활은 이벤트로
 * 오지 않고 상태 전이로만 보이기 때문에 호출부가 들고 있어야 한다.
 */
export function tally(
  previous: FrameTally,
  events: WorldEvents,
  deadBefore: boolean,
  deadAfter: boolean,
): FrameTally {
  return {
    died: previous.died || events.died,
    hurt: previous.hurt || events.hurt,
    armorBroke: previous.armorBroke || events.armorBroke,
    respawned: previous.respawned || (deadBefore && !deadAfter),
    // 마지막 것을 남긴다. 한 프레임에 두 번 맞으면 나중 것이 곧 사인이다.
    cause: events.cause ?? previous.cause,
  }
}
