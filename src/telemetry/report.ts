import type { DamageCause } from '../game/world.ts'
import { heldRate, percentileMs, averageFps } from './frames.ts'
import { retryRate, worstControlBackMs, type Session } from './session.ts'

/**
 * 계측값을 게이트 판정으로 바꾼다.
 *
 * 합격선은 `prompts/m1-gate.md` 의 표를 그대로 옮긴 것이다. 여기서 숫자를
 * 바꾸면 게이트를 무르는 것이므로, 바꿀 때는 그 문서도 함께 고친다.
 */

export const GATE = {
  /** 사망 후 즉시 재시도율 */
  retryRate: 0.9,
  /** 60fps 유지율 */
  heldRate: 0.95,
  /** 첫 클리어 시도 횟수 — 이 범위 밖이면 쉽거나 이탈한다 */
  attempts: { min: 8, max: 15 },
  /** 사망 → 조작 가능 */
  controlBackMs: 3000,
  /** 초기 로드 */
  loadBytes: 8 * 1024 * 1024,
} as const

/** 판정. 표본이 모자라면 pass 도 fail 도 아니다 — 그걸 통과로 읽으면 안 된다. */
export type Verdict = 'pass' | 'fail' | 'unknown'

export interface Metric {
  readonly key: string
  readonly label: string
  /** 사람이 읽는 값. "92%", "11회" */
  readonly value: string
  readonly target: string
  readonly verdict: Verdict
}

/** 판정에 필요한 최소 사망 수. 두세 번 죽고 재시도율을 말할 수는 없다. */
export const MIN_DEATHS = 5
/** 판정에 필요한 최소 프레임 수. 약 30초. */
export const MIN_FRAMES = 1800

export interface ReportInput {
  readonly session: Session
  /** 초기 로드 바이트. 모르면 null */
  readonly loadBytes: number | null
}

export function buildReport({ session, loadBytes }: ReportInput): readonly Metric[] {
  const judged = session.deaths.filter((d) => d.retried !== null).length
  const rate = retryRate(session)
  const held = heldRate(session.frames)
  const attempts = session.attemptsToFirstClear
  const controlBack = worstControlBackMs(session)

  return [
    {
      key: 'retryRate',
      label: '사망 후 즉시 재시도율',
      value: judged === 0 ? '-' : `${pct(rate)} (${judged}회 중)`,
      target: `${pct(GATE.retryRate)} 이상`,
      verdict: judged < MIN_DEATHS ? 'unknown' : rate >= GATE.retryRate ? 'pass' : 'fail',
    },
    {
      key: 'fps',
      label: '60fps 유지율',
      value: session.frames.samples === 0
        ? '-'
        : `${pct(held)} · p95 ${percentileMs(session.frames, 0.95)}ms · 평균 ${averageFps(session.frames).toFixed(0)}fps`,
      target: `${pct(GATE.heldRate)} 이상`,
      verdict: session.frames.samples < MIN_FRAMES
        ? 'unknown'
        : held >= GATE.heldRate ? 'pass' : 'fail',
    },
    {
      key: 'attempts',
      label: '첫 클리어 시도 횟수',
      value: attempts === null ? `미클리어 (현재 ${session.deaths.length + 1}회째)` : `${attempts}회`,
      target: `${GATE.attempts.min}~${GATE.attempts.max}회`,
      verdict: attempts === null
        ? 'unknown'
        : attempts >= GATE.attempts.min && attempts <= GATE.attempts.max ? 'pass' : 'fail',
    },
    {
      key: 'deathFx',
      label: '죽는 연출이 좋았다',
      value: session.survey.deathFxLiked === null
        ? '미응답'
        : session.survey.deathFxLiked ? '좋았다' : '아니다',
      target: '70% 이상 (테스터 합산)',
      verdict: session.survey.deathFxLiked === null
        ? 'unknown'
        : session.survey.deathFxLiked ? 'pass' : 'fail',
    },
    {
      key: 'load',
      label: '초기 로드',
      value: loadBytes === null ? '-' : formatBytes(loadBytes),
      target: `${formatBytes(GATE.loadBytes)} 이하`,
      verdict: loadBytes === null ? 'unknown' : loadBytes <= GATE.loadBytes ? 'pass' : 'fail',
    },
    {
      key: 'controlBack',
      label: '사망 → 조작 가능',
      value: controlBack === 0 ? '-' : `${(controlBack / 1000).toFixed(2)}초`,
      target: `${GATE.controlBackMs / 1000}초 이하`,
      verdict: controlBack === 0
        ? 'unknown'
        : controlBack <= GATE.controlBackMs ? 'pass' : 'fail',
    },
  ]
}

/** 전체 판정. 하나라도 fail 이면 fail, 하나라도 unknown 이면 unknown. */
export function overallVerdict(metrics: readonly Metric[]): Verdict {
  if (metrics.some((m) => m.verdict === 'fail')) return 'fail'
  if (metrics.some((m) => m.verdict === 'unknown')) return 'unknown'
  return 'pass'
}

export interface Hotspot {
  /** 구간의 시작 타일 */
  readonly tx: number
  readonly deaths: number
}

/**
 * 어디서 반복해 죽는가.
 *
 * 게이트의 "같은 지점에서 반복 사망 후 이탈 → 그 구간이 판독 불가" 진단에
 * 쓴다. 8타일(128px)이면 화면 폭의 1/4 로, 눈으로 짚을 만한 단위다.
 */
export const HOTSPOT_TILES = 8

export function deathHotspots(session: Session, tileSize = 16): readonly Hotspot[] {
  const span = HOTSPOT_TILES * tileSize
  const counts = new Map<number, number>()

  for (const death of session.deaths) {
    const tx = Math.floor(death.x / span) * HOTSPOT_TILES
    counts.set(tx, (counts.get(tx) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([tx, deaths]) => ({ tx, deaths }))
    .sort((a, b) => b.deaths - a.deaths || a.tx - b.tx)
}

/** 무엇에 죽었는가. 많은 순. */
export function causeBreakdown(session: Session): readonly (readonly [string, number])[] {
  const counts = new Map<string, number>()
  for (const death of session.deaths) {
    const key: string = death.cause ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export const CAUSE_LABELS: Readonly<Record<DamageCause | 'unknown', string>> = {
  ghoul: '좀비', grimm: '그림', corvid: '까마귀',
  cairn: '캐른', pit: '낙사', timeout: '시간 초과', unknown: '불명',
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}
