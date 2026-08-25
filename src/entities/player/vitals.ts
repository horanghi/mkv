import type { PlayerBalance } from '../../data/balance.ts'
import type { ArmorState } from '../../sprite/armor.ts'

/**
 * 갑옷 상태 머신 — 게임의 심장.
 *
 * ```
 * 성유물 --피격--> 강철 --피격--> 속옷 --피격--> 사망
 *  (선택)          (기본)        (마지막 기회)
 * ```
 *
 * 성유물은 상시 유지가 아니라 **1회성 유예 + 파워업**이다.
 * 원작의 "2피격 사망" 긴장을 유지하면서 잘한 플레이에 보상을 준다.
 * → docs/02-core-mechanics.md 2.5
 */

export const LIVING_ARMORS = ['relic', 'steel', 'bare'] as const
export type LivingArmor = (typeof LIVING_ARMORS)[number]

/** 성유물 3종. 색과 성흔 마법이 다르다. → docs/03-weapons-magic.md 3.4 */
export const RELIC_KINDS = ['gold', 'silver', 'crystal'] as const
export type RelicKind = (typeof RELIC_KINDS)[number]

export interface Vitals {
  readonly armor: LivingArmor
  /** 성유물 종류. `armor` 가 relic 일 때만 의미가 있다. */
  readonly relic: RelicKind | null
  readonly iFrames: number
  readonly lives: number
  readonly dead: boolean
}

export interface HitResult {
  readonly vitals: Vitals
  /** 무적이라 아무 일도 없었는가. 큐에 쌓지 않는다. */
  readonly blocked: boolean
  /** 갑옷이 깨졌는가. 파괴 연출(180ms 히트스톱)의 신호. */
  readonly broke: boolean
  /** 이번 피격으로 죽었는가. 사망 연출(250ms)의 신호. */
  readonly died: boolean
}

export function createVitals(balance: PlayerBalance): Vitals {
  return {
    armor: 'steel',
    relic: null,
    iFrames: 0,
    lives: balance.startingLives,
    dead: false,
  }
}

/** 한 틱. 무적 프레임만 줄인다. */
export function tickVitals(vitals: Vitals): Vitals {
  if (vitals.iFrames === 0) return vitals
  return { ...vitals, iFrames: Math.max(0, vitals.iFrames - 1) }
}

export function isInvulnerable(vitals: Vitals): boolean {
  return vitals.iFrames > 0
}

/** 무적 중 깜빡임. 4프레임 주기 — 켜짐과 꺼짐이 각각 2프레임이다. */
export function isBlinking(vitals: Vitals, balance: PlayerBalance): boolean {
  if (vitals.iFrames === 0) return false
  const period = balance.hitFlashPeriodFrames
  return vitals.iFrames % period < period / 2
}

/**
 * 피격.
 *
 * **무적 중에는 아무 일도 없다.** 데미지를 쌓아두지 않는다 — 무적이 끝나는
 * 순간 밀린 피격이 터지면 플레이어는 이유를 알 수 없다.
 *
 * 한 번에 한 단계씩만 내려간다. 어떤 경로로도 단계를 건너뛰지 않는다.
 */
export function takeHit(vitals: Vitals, balance: PlayerBalance): HitResult {
  if (vitals.dead || isInvulnerable(vitals)) {
    return { vitals, blocked: true, broke: false, died: false }
  }

  if (vitals.armor === 'bare') {
    return { vitals: { ...vitals, dead: true, iFrames: 0 }, blocked: false, broke: true, died: true }
  }

  const next: LivingArmor = vitals.armor === 'relic' ? 'steel' : 'bare'
  return {
    vitals: { ...vitals, armor: next, relic: null, iFrames: balance.iFrames.hit },
    blocked: false,
    broke: true,
    died: false,
  }
}

/**
 * 낙사.
 *
 * 갑옷 상태와 **무관하게 즉사**다. 원작 계승이고, 성유물도 막지 못한다.
 * 무적 중에도 죽는다 — 구덩이는 공격이 아니라 지형이다.
 */
export function fallIntoPit(vitals: Vitals): Vitals {
  return { ...vitals, dead: true, iFrames: 0 }
}

/**
 * 성유물 획득. 스테이지당 최대 하나다.
 *
 * 이미 성유물을 입고 있으면 종류만 바뀐다 — 겹쳐 입어 HP 가 늘지 않는다.
 */
export function pickUpRelic(
  vitals: Vitals,
  kind: RelicKind,
  balance: PlayerBalance,
): Vitals {
  if (vitals.dead) return vitals
  return { ...vitals, armor: 'relic', relic: kind, iFrames: balance.iFrames.relicPickup }
}

export function canRespawn(vitals: Vitals): boolean {
  return vitals.lives > 0
}

export function isGameOver(vitals: Vitals): boolean {
  return vitals.dead && vitals.lives <= 0
}

/** 잔기를 하나 쓰고 강철 갑옷으로 부활한다. 성유물은 돌아오지 않는다. */
export function respawn(vitals: Vitals, balance: PlayerBalance): Vitals {
  if (!canRespawn(vitals)) return vitals
  return {
    armor: 'steel',
    relic: null,
    iFrames: balance.iFrames.respawn,
    lives: vitals.lives - 1,
    dead: false,
  }
}

export interface ContinueResult {
  readonly vitals: Vitals
  /** 컨티뉴 페널티 — 무기가 기본 창으로 돌아간다. → docs/02 2.6 */
  readonly weaponId: string
}

export function continueGame(balance: PlayerBalance): ContinueResult {
  return { vitals: createVitals(balance), weaponId: 'lance' }
}

/** 속옷은 이동이 8% 빠르다. 공포 보정이다. */
export function speedMultiplier(vitals: Vitals, balance: PlayerBalance): number {
  return vitals.armor === 'bare' ? 1 + balance.bareSpeedBonus : 1
}

/**
 * 성유물은 빛난다.
 *
 * 어두운 스테이지에서 갑옷이 곧 등불이므로, 잃으면 세계가 실제로 어두워진다.
 */
export function emitsLight(vitals: Vitals): boolean {
  return !vitals.dead && vitals.armor === 'relic'
}

/** 스프라이트가 쓸 상태. 사망은 백골로 그린다. */
export function spriteStateOf(vitals: Vitals): ArmorState {
  if (vitals.dead) return 'bones'
  return vitals.armor
}
