import { averageFps, heldRate, percentileMs } from './frames.ts'
import { causeBreakdown, deathHotspots } from './report.ts'
import { retryRate, worstControlBackMs, type Session } from './session.ts'

/**
 * 테스터가 돌려주는 결과 꾸러미.
 *
 * 세션 전체를 그대로 주지 않고 게이트가 묻는 것만 추린다. 짧아야 메신저에
 * 붙여넣을 수 있고, 여러 명 것을 합치기도 쉽다.
 *
 * 개인을 가리키는 값은 담지 않는다. `id` 는 브라우저에서 만든 난수다.
 */

export interface Payload {
  readonly id: string
  readonly v: number
  /** 잰 난이도. 이게 없으면 "첫 클리어 몇 회"를 읽을 수 없다. */
  readonly diff: string
  readonly playMin: number
  readonly deaths: number
  /** 판정이 끝난 사망만 분모에 넣은 즉시 재시도율 */
  readonly retryRate: number | null
  readonly attempts: number | null
  readonly cleared: boolean
  readonly bossReached: boolean
  readonly hurts: number
  readonly armorBreaks: number
  readonly fps: {
    readonly held: number | null
    readonly p95: number
    readonly avg: number
    readonly samples: number
    readonly worst: number
  }
  readonly loadKB: number | null
  readonly worstRespawnMs: number
  readonly causes: Readonly<Record<string, number>>
  /** [시작 타일, 사망 수] */
  readonly hotspots: readonly (readonly [number, number])[]
  readonly survey: {
    readonly deathFxLiked: boolean | null
    readonly jumpStiff: boolean | null
    readonly note: string
  }
}

/** 자유 서술은 잘라 낸다. 붙여넣기가 감당 못 할 길이가 되면 안 된다. */
export const NOTE_LIMIT = 500

export function toPayload(session: Session, loadBytes: number | null): Payload {
  const judged = session.deaths.filter((d) => d.retried !== null).length

  return {
    id: session.id,
    v: session.version,
    diff: session.difficulty,
    playMin: round(session.playMs / 60000, 1),
    deaths: session.deaths.length,
    retryRate: judged === 0 ? null : round(retryRate(session), 3),
    attempts: session.attemptsToFirstClear,
    cleared: session.clears > 0,
    bossReached: session.bossReached,
    hurts: session.hurts,
    armorBreaks: session.armorBreaks,
    fps: {
      held: session.frames.samples === 0 ? null : round(heldRate(session.frames), 3),
      p95: percentileMs(session.frames, 0.95),
      avg: round(averageFps(session.frames), 1),
      samples: session.frames.samples,
      worst: round(session.frames.worstMs, 1),
    },
    loadKB: loadBytes === null ? null : Math.round(loadBytes / 1024),
    worstRespawnMs: Math.round(worstControlBackMs(session)),
    causes: Object.fromEntries(causeBreakdown(session)),
    hotspots: deathHotspots(session).map((spot) => [spot.tx, spot.deaths] as const),
    survey: {
      deathFxLiked: session.survey.deathFxLiked,
      jumpStiff: session.survey.jumpStiff,
      note: session.survey.note.slice(0, NOTE_LIMIT),
    },
  }
}

export function toJson(session: Session, loadBytes: number | null): string {
  return JSON.stringify(toPayload(session, loadBytes))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
