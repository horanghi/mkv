import type { KeyboardSource } from '../../core/keyboard.ts'
import type { Difficulty } from '../../game/difficulty.ts'
import { totalLoadBytes, type SizedEntry } from '../../telemetry/loadSize.ts'
import { toJson } from '../../telemetry/payload.ts'
import { record, resume, type Observation, type RecorderState } from '../../telemetry/recorder.ts'
import { MIN_DEATHS } from '../../telemetry/report.ts'
import {
  answerSurvey, closePending, withDifficulty, withId,
  type Session, type Survey,
} from '../../telemetry/session.ts'
import { load, save } from '../../telemetry/storage.ts'
import { GateReportPanel } from './gateReport.ts'
import { SurveyCard } from './surveyCard.ts'

/**
 * 플레이테스트 계측의 브라우저 쪽 배선.
 *
 * 저장, 패널, 시계처럼 브라우저에 붙는 것만 여기 있다. 계산은 전부
 * `telemetry/` 에 있고 그쪽이 테스트된다. `main.ts` 를 얇게 두려고 나눴다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 ui/ 제외.
 */

/** 저장 주기. 자주 쓰면 프레임을 먹고, 뜸하면 탭이 죽었을 때 잃는다. */
const SAVE_INTERVAL_MS = 5000

/**
 * 시계 한 걸음의 상한.
 *
 * 계측 시계는 벽시계가 아니라 **그려진 프레임의 누적**이다. 벽시계를 쓰면
 * 탭을 접어 둔 시간이 플레이 시간으로 잡히고, 재시도 창도 플레이어가
 * 아무것도 안 했는데 만료된다. 긴 공백은 여기서 잘라 낸다.
 */
const MAX_CLOCK_STEP_MS = 250

/** `nowMs` 를 뺀 관측값. 시계는 여기서 댄다. */
export type FrameObservation = Omit<Observation, 'nowMs'>

export class Playtest {
  private state: RecorderState
  private readonly card: SurveyCard
  private readonly panel: GateReportPanel
  /**
   * 계측 시계 (ms). 이전 방문까지의 누적에서 이어 간다 — 새로고침해도
   * 시각이 뒤로 가지 않아야 사망 기록의 순서가 유지된다.
   */
  private elapsedMs: number
  private lastSavedAt = 0
  private loadBytes: number | null = null
  private entries: readonly SizedEntry[] = []
  private revealed = false

  constructor(host: HTMLElement, private readonly keyboard: KeyboardSource) {
    const stored = withId(load(browserStore()), makeId())
    this.elapsedMs = stored.playMs
    this.state = resume(stored)
    this.revealed = stored.deaths.length >= MIN_DEATHS

    this.panel = new GateReportPanel(host)
    this.card = new SurveyCard(host, {
      onAnswer: (patch: Partial<Survey>) => {
        this.state = { ...this.state, session: answerSurvey(this.state.session, patch) }
        this.persist()
      },
      getPayload: () => toJson(this.state.session, this.loadBytes),
      // 카드가 열려 있는 동안 키 입력은 게임이 아니라 메모로 간다.
      onOpenChange: (open) => this.keyboard.setSuspended(open),
    })
    if (this.revealed) this.card.revealEntry()

    // 나가기 직전에 판정이 남은 사망을 닫는다. 그게 곧 "이탈"의 정의다.
    window.addEventListener('pagehide', () => this.finish())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.finish()
    })
  }

  get session(): Session {
    return this.state.session
  }

  get surveyOpen(): boolean {
    return this.card.isOpen
  }

  /** 매 프레임 부른다. */
  frame(observation: FrameObservation): void {
    this.elapsedMs += Math.min(observation.frameMs, MAX_CLOCK_STEP_MS)
    this.state = record(this.state, { ...observation, nowMs: this.elapsedMs })

    if (!this.revealed && this.state.session.deaths.length >= MIN_DEATHS) {
      this.revealed = true
      this.card.revealEntry()
    }

    this.panel.render(this.state.session, this.loadBytes, this.entries)
    if (this.elapsedMs - this.lastSavedAt >= SAVE_INTERVAL_MS) this.persist()
  }

  /**
   * 난이도가 바뀌었음을 알린다.
   *
   * 바뀌면 세션을 **버리고 새로 시작한다.** 관용 규칙이 다른 판의 사망을
   * 한 꾸러미에 담으면 재시도율도 시도 횟수도 어느 난이도의 값이 아니게 된다.
   */
  setDifficulty(difficulty: Difficulty): void {
    const next = withDifficulty(this.state.session, difficulty, makeId())
    if (next === this.state.session) return

    this.state = resume(next)
    this.elapsedMs = 0
    this.lastSavedAt = 0
    this.revealed = false
    this.persist()
  }

  /**
   * 설문 카드를 띄운다. 클리어 결과 화면을 닫은 뒤에 부른다.
   *
   * 클리어 즉시 띄우면 결과 화면을 덮는다. 보상이 먼저고 설문이 나중이다.
   */
  promptSurvey(): void {
    this.card.showOnce()
  }

  toggleGatePanel(): void {
    this.panel.toggle()
  }

  /**
   * 받은 바이트를 잰다. 로드가 끝난 뒤 한 번 부른다.
   *
   * 우리가 만든 자원만 센다 — 확장 프로그램이 끼워 넣은 것까지 예산에 넣으면
   * 테스터의 브라우저 설정이 게이트를 떨어뜨린다.
   */
  measureLoad(): void {
    if (typeof performance.getEntriesByType !== 'function') return

    const origin = window.location.origin
    const resources = performance.getEntriesByType('resource') as unknown as SizedEntry[]
    const navigation = performance.getEntriesByType('navigation') as unknown as SizedEntry[]

    this.entries = [...navigation, ...resources.filter((entry) => entry.name.startsWith(origin))]
    this.loadBytes = totalLoadBytes(this.entries)
  }

  /** 세션을 닫고 저장한다. 두 번 불러도 안전하다. */
  finish(): void {
    this.state = { ...this.state, session: closePending(this.state.session, this.elapsedMs) }
    this.persist()
  }

  private persist(): void {
    this.lastSavedAt = this.elapsedMs
    save(browserStore(), this.state.session)
  }
}

/** localStorage 가 없거나 막힌 환경에서도 죽지 않는다. */
function browserStore(): Parameters<typeof load>[0] {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // 사파리 프라이빗 등. 아래 빈 저장소로 떨어진다.
  }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
}

function makeId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid !== undefined) return uuid.slice(0, 8)
  // 결정론을 지키는 자리가 아니다 — 결과를 합칠 때 겹치지만 않으면 된다.
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')
}
