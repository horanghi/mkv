import type { ArmorState } from '../sprite/armor.ts'
import type { WorldEvents } from './world.ts'

/**
 * 한 판의 집계.
 *
 * 결과 화면(docs/09 9.4)이 요구하는 것만 모은다. 월드 상태에 넣지 않은 이유는
 * 이것이 **판의 기록**이지 게임 규칙이 아니기 때문이다 — 리셋하면 사라진다.
 *
 * 순수 함수다. 점수 규칙은 docs/02 2.7 을 따른다.
 */

/** 잡몹 처치. docs/02 2.7 의 100~500 구간 안이다. */
export const KILL_SCORE = 200
/** 보스에 넣은 데미지 1 당. */
export const BOSS_HIT_SCORE = 3
/** 노히트 구간 보너스. docs/02 2.7 */
export const NO_HIT_BONUS = 2000
/** 남은 시간 1초당. docs/02 2.7 */
export const TIME_BONUS_PER_SECOND = 50
/** 성유물 갑옷 유지 클리어. docs/02 2.7 */
export const RELIC_BONUS = 10000

export interface RunStats {
  readonly ticks: number
  readonly enemiesKilled: number
  /** 처치·보스 타격 누적 */
  readonly score: number
  /** 구간별로 한 번이라도 맞았는가 */
  readonly hitSections: readonly boolean[]
  /** 성유물을 입어 본 적이 있는가 */
  readonly hadRelic: boolean
  /** 성유물을 끝까지 지켰는가. 한 번이라도 잃으면 다시 참이 되지 않는다 */
  readonly relicKept: boolean
}

export function createRun(sectionCount: number): RunStats {
  return {
    ticks: 0,
    enemiesKilled: 0,
    score: 0,
    hitSections: new Array<boolean>(Math.max(1, sectionCount)).fill(false),
    hadRelic: false,
    relicKept: false,
  }
}

export interface RunObservation {
  readonly events: WorldEvents
  /** 지금 플레이어가 있는 구간 */
  readonly sectionIndex: number
  readonly armor: ArmorState
}

export function stepRun(stats: RunStats, o: RunObservation): RunStats {
  const wearing = o.armor === 'relic'
  const hadRelic = stats.hadRelic || wearing
  // 한 번 잃으면 끝이다. 다시 주워도 "유지"가 아니다.
  const lostBefore = stats.hadRelic && !stats.relicKept
  const relicKept = wearing && !lostBefore

  let hitSections = stats.hitSections
  if (o.events.hurt || o.events.died) {
    const index = Math.max(0, Math.min(hitSections.length - 1, Math.trunc(o.sectionIndex)))
    if (hitSections[index] !== true) {
      const next = hitSections.slice()
      next[index] = true
      hitSections = next
    }
  }

  return {
    ticks: stats.ticks + 1,
    enemiesKilled: stats.enemiesKilled + o.events.enemiesKilled,
    score: stats.score + o.events.enemiesKilled * KILL_SCORE + o.events.bossHit * BOSS_HIT_SCORE,
    hitSections,
    hadRelic,
    relicKept,
  }
}

/** 한 번도 맞지 않은 구간 수. */
export function cleanSections(stats: RunStats): number {
  return stats.hitSections.filter((hit) => !hit).length
}
