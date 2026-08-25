import type { Vitals } from '../../entities/player/vitals.ts'

/**
 * HUD 상태.
 *
 * 상시 요소는 넷뿐이다 — 잔기, 무기, 시간, 점수.
 * **갑옷 상태는 표시하지 않는다.** 랜슬 스프라이트가 곧 체력 게이지이고,
 * 플레이어는 구석이 아니라 자기 캐릭터를 보고 있어야 한다.
 * → docs/09-ui-ux-controls.md 9.2
 */

export interface HudState {
  readonly lives: number
  readonly weaponId: string
  readonly secondsLeft: number
  readonly score: number
  /** 조건부 — 성유물 착용 시에만 */
  readonly sigilCooldown: number | null
  /** 조건부 — 보스전에서만 [0,1] */
  readonly bossHp: number | null
  /** 자동 흐림 알파 */
  readonly alpha: number
  /** 아무 일도 없이 지난 시간 */
  readonly quietMs: number
}

/** 3초간 아무 이벤트가 없고 적이 없으면 흐려진다. */
export const AUTO_DIM = { afterMs: 3000, alpha: 0.6 } as const
/** 잔여 30초부터 시간이 붉게 맥동한다. */
export const TIME_WARNING_SECONDS = 30

export const INITIAL_HUD: HudState = Object.freeze({
  lives: 3,
  weaponId: 'lance',
  secondsLeft: 300,
  score: 0,
  sigilCooldown: null,
  bossHp: null,
  alpha: 1,
  quietMs: 0,
})

export interface HudInputs {
  readonly vitals: Vitals
  readonly weaponId: string
  readonly secondsLeft: number
  readonly score: number
  readonly bossHp: number | null
  /** 이번 틱에 무슨 일이 있었는가. 있으면 HUD 가 밝아진다. */
  readonly busy: boolean
}

export function stepHud(state: HudState, inputs: HudInputs, dtMs: number): HudState {
  const quietMs = inputs.busy ? 0 : state.quietMs + Math.max(0, dtMs)
  const dimming = quietMs >= AUTO_DIM.afterMs
  // 흐려지는 것은 천천히, 밝아지는 것은 즉시. 정보가 필요한 순간에 기다리게 하면 안 된다.
  const alpha = dimming
    ? Math.max(AUTO_DIM.alpha, state.alpha - dtMs / 1000)
    : 1

  return {
    lives: inputs.vitals.lives,
    weaponId: inputs.weaponId,
    secondsLeft: Math.max(0, inputs.secondsLeft),
    score: inputs.score,
    // 성흔 마법은 성유물 갑옷에서만 쓴다. → docs/03 3.4
    sigilCooldown: inputs.vitals.armor === 'relic' ? (state.sigilCooldown ?? 0) : null,
    bossHp: inputs.bossHp,
    alpha,
    quietMs,
  }
}

export function isTimeCritical(state: HudState): boolean {
  return state.secondsLeft <= TIME_WARNING_SECONDS
}

/** `04:12` 형식. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** `128,400` 형식. */
export function formatScore(score: number): string {
  return Math.max(0, Math.floor(score)).toLocaleString('en-US')
}

// ── 사망 → 리스폰 타임라인 ──────────────────────────────────────────────────

/**
 * docs/09 의 표를 그대로 옮긴 것이다. **총 1.85초에 조작 가능해진다.**
 * 3초 예산 안이고, 잔기가 남아 있으면 어떤 UI 도 끼어들지 않는다.
 *
 * **여기 적힌 수치가 게임을 움직이지는 않는다.** 실제 재생은
 * `fx/sequence.ts` 의 `DEATH` 와 `game/world.ts` 의 `RESPAWN_DELAY_TICKS` 가
 * 정한다. 이 표는 명세이므로 자기 자신과 대조해서는 아무것도 지킬 수 없다 —
 * 실제 상수와의 대조는 `game/world.test.ts` "사망 → 조작 3초 예산" 이 한다.
 */
export const DEATH_TIMELINE = {
  hitstopMs: 250,
  skeletonizeAtMs: 250,
  slowMotionMs: 1000,
  fadeOutAtMs: 1250,
  fadeMs: 300,
  moveAtMs: 1550,
  playableAtMs: 1850,
} as const

export function deathToPlayableMs(): number {
  return DEATH_TIMELINE.playableAtMs
}

