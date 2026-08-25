import { NO_HIT_BONUS, RELIC_BONUS, TIME_BONUS_PER_SECOND, cleanSections, type RunStats } from './runStats.ts'

/**
 * 결과 화면 — 점수 내역과 랭크.
 *
 * 표 구성과 롤링 연출은 docs/09 9.4 를 따른다.
 * 점수 규칙은 docs/02 2.7 이 원본이다.
 *
 * 순수 함수다. 그리는 것은 `ui/menus/resultsScreen.ts` 다.
 */

export type Rank = 'S' | 'A' | 'B' | 'C'

/**
 * 랭크 경계.
 *
 * **잠정값이다.** 실제 클리어 점수 분포를 본 적이 없으므로 지금은
 * "성유물 없이 깔끔하게 깨면 A" 를 기준으로 잡았다.
 * m1-gate 의 계측이 첫 클리어 기록을 모으므로, 그 데이터로 다시 잡는다.
 * → prompts/m1-gate.md
 */
export const RANK_THRESHOLDS: Readonly<Record<Exclude<Rank, 'C'>, number>> = {
  S: 20000,
  A: 13000,
  B: 7000,
}

export function rankFor(total: number): Rank {
  if (total >= RANK_THRESHOLDS.S) return 'S'
  if (total >= RANK_THRESHOLDS.A) return 'A'
  if (total >= RANK_THRESHOLDS.B) return 'B'
  return 'C'
}

export interface ResultLine {
  readonly key: string
  readonly label: string
  /** 왼쪽에 붙는 실적. "03:24", "28/34" */
  readonly detail: string
  readonly points: number
}

export interface Results {
  readonly lines: readonly ResultLine[]
  readonly total: number
  readonly rank: Rank
}

export interface ResultContext {
  /** 클리어 시점의 남은 시간 (초) */
  readonly secondsLeft: number
  /** 스테이지의 적 배치 수 */
  readonly enemyTotal: number
}

export function buildResults(stats: RunStats, ctx: ResultContext): Results {
  const seconds = Math.max(0, Math.floor(ctx.secondsLeft))
  const clean = cleanSections(stats)

  const lines: ResultLine[] = [
    {
      key: 'time',
      label: 'TIME',
      detail: formatClock(seconds),
      points: seconds * TIME_BONUS_PER_SECOND,
    },
    {
      key: 'enemies',
      label: 'ENEMIES',
      detail: `${stats.enemiesKilled}/${ctx.enemyTotal}`,
      points: stats.score,
    },
    {
      key: 'nohit',
      label: 'NO-HIT',
      detail: clean === 0 ? '-' : `${clean} section${clean === 1 ? '' : 's'}`,
      points: clean * NO_HIT_BONUS,
    },
    {
      key: 'relic',
      label: 'RELIC',
      detail: stats.relicKept ? 'maintained' : stats.hadRelic ? 'lost' : '-',
      points: stats.relicKept ? RELIC_BONUS : 0,
    },
  ]

  const total = lines.reduce((sum, line) => sum + line.points, 0)
  return { lines, total, rank: rankFor(total) }
}

/** 남은 시간을 mm:ss 로. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 한 줄이 차오르는 데 걸리는 시간. 네 줄 합쳐 2.0초 + 합계 0.5초 = 2.5초. */
export const LINE_ROLL_MS = 500
/** 합계가 차오르는 시간. */
export const TOTAL_ROLL_MS = 500

export interface RollingLine {
  readonly line: ResultLine
  /** 지금 화면에 보이는 점수 */
  readonly shown: number
}

export interface Rolling {
  readonly lines: readonly RollingLine[]
  readonly total: number
  /** 랭크 도장을 찍을 때가 됐는가 */
  readonly rankVisible: boolean
  /** 도장이 찍힌 뒤 흐른 시간 (ms). 아직이면 0 */
  readonly stampMs: number
  readonly done: boolean
}

export function rollingDurationMs(results: Results): number {
  return results.lines.length * LINE_ROLL_MS + TOTAL_ROLL_MS
}

/**
 * 경과에 따른 표시 상태.
 *
 * 줄이 하나씩 차오르고, 다 차면 합계가 오르고, 그다음 랭크가 찍힌다.
 * 아무 키나 누르면 `elapsedMs` 를 끝으로 밀어 즉시 완료한다. → docs/09 9.4
 */
export function rollingAt(results: Results, elapsedMs: number): Rolling {
  const elapsed = Math.max(0, elapsedMs)

  const lines = results.lines.map((line, i) => {
    const progress = clamp01((elapsed - i * LINE_ROLL_MS) / LINE_ROLL_MS)
    return { line, shown: Math.round(line.points * progress) }
  })

  const afterLines = results.lines.length * LINE_ROLL_MS
  const totalProgress = clamp01((elapsed - afterLines) / TOTAL_ROLL_MS)
  const done = elapsed >= rollingDurationMs(results)

  return {
    lines,
    total: Math.round(results.total * totalProgress),
    rankVisible: done,
    stampMs: done ? elapsed - rollingDurationMs(results) : 0,
    done,
  }
}

/**
 * 랭크 도장.
 *
 * docs/09 9.4: "스탬프 애니메이션 + 히트스톱 + 셰이크".
 * 크게 떠 있다가 내리꽂히고, 닿는 순간 잠깐 멈췄다가 흔들린다.
 * 멈추는 구간이 없으면 그냥 축소 애니메이션이지 도장이 아니다.
 */
export interface Stamp {
  /** 배율. 1 이 제자리 */
  readonly scale: number
  readonly opacity: number
  /** 셰이크 오프셋 (px) */
  readonly shakeX: number
  readonly shakeY: number
  /** 발광 세기 0~1. S 랭크에서만 쓴다 */
  readonly glow: number
}

/** 내리꽂히는 시간. */
export const STAMP_DROP_MS = 170
/** 닿는 순간의 정지 — 히트스톱. */
export const STAMP_HOLD_MS = 90
/** 흔들리는 시간. */
export const STAMP_SHAKE_MS = 260

export function stampAt(stampMs: number, rank: Rank): Stamp {
  const t = Math.max(0, stampMs)

  if (t < STAMP_DROP_MS) {
    // 2.6배에서 1배로. 뒤로 갈수록 빨라져야 내리꽂히는 것으로 보인다.
    const p = t / STAMP_DROP_MS
    const eased = p * p * p
    return { scale: 2.6 - 1.6 * eased, opacity: p, shakeX: 0, shakeY: 0, glow: 0 }
  }

  const after = t - STAMP_DROP_MS
  if (after < STAMP_HOLD_MS) {
    // 히트스톱 — 완전히 정지한다.
    return { scale: 1, opacity: 1, shakeX: 0, shakeY: 0, glow: glowFor(rank, t) }
  }

  const shakeElapsed = after - STAMP_HOLD_MS
  if (shakeElapsed < STAMP_SHAKE_MS) {
    // 감쇠 진동. 가로세로 주파수를 어긋나게 해 원운동으로 보이지 않게 한다.
    const decay = 1 - shakeElapsed / STAMP_SHAKE_MS
    const amp = 4 * decay * decay
    return {
      scale: 1,
      opacity: 1,
      shakeX: Math.sin(shakeElapsed / 1000 * 47) * amp,
      shakeY: Math.sin(shakeElapsed / 1000 * 31 + 1.1) * amp * 0.6,
      glow: glowFor(rank, t),
    }
  }

  return { scale: 1, opacity: 1, shakeX: 0, shakeY: 0, glow: glowFor(rank, t) }
}

/** S 랭크만 빛난다. 나머지는 도장으로 충분하다. → docs/09 9.4 */
function glowFor(rank: Rank, t: number): number {
  if (rank !== 'S') return 0
  return 0.6 + 0.4 * Math.sin(t / 1000 * 4)
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}
