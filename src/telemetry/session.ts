import type { DamageCause } from '../game/world.ts'
import { EMPTY_FRAMES, type FrameStats } from './frames.ts'

/**
 * 플레이테스트 세션 계측.
 *
 * m1-gate 는 "추측하지 말고 계측한다"고 못박는데, 정작 빌드에 계측기가 없으면
 * 테스터의 기억에 의존하게 된다. 여기서 재는 것은 게이트 표의 항목 그대로다.
 *
 * 전부 순수 함수다. 시계는 밖에서 넣는다(`nowMs`, 세션 시작으로부터의 경과).
 * 그래야 테스트가 실제 시간을 기다리지 않는다.
 *
 * → prompts/m1-gate.md
 */

/** 저장 형식 버전. 항목이 바뀌면 올린다 — 낡은 기록은 버린다. */
export const SESSION_VERSION = 1

/**
 * 조작이 돌아온 뒤 이 시간 안에 입력이 들어오면 "즉시 재시도"로 본다.
 *
 * 게이트의 재시도율은 "죽고 나서 바로 또 하는가"를 묻는다. 3초는 관대한
 * 편인데, 그래야 잠깐 화면을 보고 다시 붙는 사람을 이탈로 오판하지 않는다.
 * 창을 넘겨 아무 입력이 없으면 이탈로 센다.
 */
export const RETRY_WINDOW_MS = 3000

export interface DeathRecord {
  /** 죽은 지점의 월드 x. 구간별 사망 집계에 쓴다. */
  readonly x: number
  readonly cause: DamageCause | null
  /** 세션 시작으로부터 죽은 시각 */
  readonly atMs: number
  /** 죽고 나서 조작이 돌아오기까지 (ms). 아직이면 null */
  readonly controlBackMs: number | null
  /** 즉시 재시도했는가. 아직 판정 전이면 null */
  readonly retried: boolean | null
}

export interface Survey {
  /** "죽는 연출이 좋았다" */
  readonly deathFxLiked: boolean | null
  /** "점프가 답답하다" — M0 게이트 항목을 계속 본다 */
  readonly jumpStiff: boolean | null
  /** 자유 서술 */
  readonly note: string
}

export const EMPTY_SURVEY: Survey = Object.freeze({
  deathFxLiked: null, jumpStiff: null, note: '',
})

export interface Session {
  readonly version: number
  /**
   * 이 세션의 짧은 식별자.
   *
   * 테스터 여러 명의 결과를 합칠 때 같은 사람이 두 번 붙여넣은 것을 걸러낸다.
   * 개인을 가리키는 값이 아니다 — 브라우저에서 만든 난수다.
   */
  readonly id: string
  /** 누적 플레이 시간. 죽어 있는 동안도 포함한다 (재시작 마찰이 지표이므로) */
  readonly playMs: number
  readonly deaths: readonly DeathRecord[]
  readonly clears: number
  /** 첫 클리어까지의 시도 횟수 (사망 + 1). 아직이면 null */
  readonly attemptsToFirstClear: number | null
  readonly msToFirstClear: number | null
  readonly bossReached: boolean
  readonly hurts: number
  readonly armorBreaks: number
  readonly frames: FrameStats
  readonly survey: Survey
}

export const NEW_SESSION: Session = Object.freeze({
  version: SESSION_VERSION,
  id: '',
  playMs: 0,
  deaths: Object.freeze([]) as readonly DeathRecord[],
  clears: 0,
  attemptsToFirstClear: null,
  msToFirstClear: null,
  bossReached: false,
  hurts: 0,
  armorBreaks: 0,
  frames: EMPTY_FRAMES,
  survey: EMPTY_SURVEY,
})

/** 마지막 사망 기록을 바꾼 새 세션. 없으면 그대로 돌려준다. */
function withLastDeath(
  session: Session,
  edit: (death: DeathRecord) => DeathRecord,
): Session {
  const last = session.deaths[session.deaths.length - 1]
  if (last === undefined) return session

  const deaths = session.deaths.slice(0, -1)
  deaths.push(edit(last))
  return { ...session, deaths }
}

/** 아직 식별자가 없으면 붙인다. 한 번 붙으면 바뀌지 않는다. */
export function withId(session: Session, id: string): Session {
  return session.id === '' ? { ...session, id } : session
}

export function noteFrame(session: Session, frames: FrameStats, playMs: number): Session {
  return { ...session, frames, playMs }
}

export function noteDeath(
  session: Session,
  x: number,
  cause: DamageCause | null,
  nowMs: number,
): Session {
  // 판정이 남은 직전 사망은 이탈로 닫는다 — 다시 죽었다는 건 계속했다는 뜻이지만,
  // 그 재시도는 이미 입력으로 잡혔어야 한다. 안 잡혔다면 창을 넘긴 것이다.
  const closed = closePending(session, nowMs)
  const death: DeathRecord = { x, cause, atMs: nowMs, controlBackMs: null, retried: null }
  return { ...closed, deaths: [...closed.deaths, death] }
}

/** 조작이 다시 가능해졌다. 여기서부터 재시도 창이 열린다. */
export function noteControlBack(session: Session, nowMs: number): Session {
  return withLastDeath(session, (death) =>
    death.controlBackMs === null ? { ...death, controlBackMs: nowMs } : death)
}

/** 플레이어가 무언가를 눌렀다. 재시도 창이 열려 있으면 재시도로 확정한다. */
export function noteInput(session: Session, nowMs: number): Session {
  return withLastDeath(session, (death) => {
    if (death.retried !== null || death.controlBackMs === null) return death
    return { ...death, retried: nowMs - death.controlBackMs <= RETRY_WINDOW_MS }
  })
}

/**
 * 시간만 흘렀다. 재시도 창이 입력 없이 만료됐으면 이탈로 확정한다.
 * 매 프레임 부르면 된다 — 바뀔 게 없으면 같은 객체를 돌려준다.
 */
export function observe(session: Session, nowMs: number): Session {
  const last = session.deaths[session.deaths.length - 1]
  if (last === undefined || last.retried !== null || last.controlBackMs === null) return session
  if (nowMs - last.controlBackMs <= RETRY_WINDOW_MS) return session

  return withLastDeath(session, (death) => ({ ...death, retried: false }))
}

/** 세션을 닫는다. 판정이 남은 사망은 이탈이다 — 그대로 나갔다는 뜻이므로. */
export function closePending(session: Session, nowMs: number): Session {
  return withLastDeath(session, (death) => {
    if (death.retried !== null) return death
    // 조작이 돌아오지도 않았는데 세션이 끝났다면, 연출 도중에 나간 것이다.
    if (death.controlBackMs === null) return { ...death, retried: false }
    return { ...death, retried: nowMs - death.controlBackMs <= RETRY_WINDOW_MS }
  })
}

export function noteHurt(session: Session): Session {
  return { ...session, hurts: session.hurts + 1 }
}

export function noteArmorBreak(session: Session): Session {
  return { ...session, armorBreaks: session.armorBreaks + 1 }
}

export function noteBossReached(session: Session): Session {
  return session.bossReached ? session : { ...session, bossReached: true }
}

export function noteClear(session: Session, nowMs: number): Session {
  const first = session.clears === 0
  return {
    ...session,
    clears: session.clears + 1,
    attemptsToFirstClear: first ? session.deaths.length + 1 : session.attemptsToFirstClear,
    msToFirstClear: first ? nowMs : session.msToFirstClear,
  }
}

export function answerSurvey(session: Session, patch: Partial<Survey>): Session {
  return { ...session, survey: { ...session.survey, ...patch } }
}

/** 게이트 지표: 즉시 재시도율 (0~1). 판정이 끝난 사망만 분모에 넣는다. */
export function retryRate(session: Session): number {
  const judged = session.deaths.filter((d) => d.retried !== null)
  if (judged.length === 0) return 0
  return judged.filter((d) => d.retried === true).length / judged.length
}

/** 게이트 지표: 사망 → 조작 가능까지 걸린 시간의 최댓값 (ms). */
export function worstControlBackMs(session: Session): number {
  let worst = 0
  for (const death of session.deaths) {
    if (death.controlBackMs === null) continue
    worst = Math.max(worst, death.controlBackMs - death.atMs)
  }
  return worst
}
