import { DEFAULT_DIFFICULTY } from '../game/difficulty.ts'
import { UNKNOWN_BUILD } from './build.ts'
import { GATE, MIN_DEATHS, type Verdict } from './report.ts'
import { SESSION_VERSION } from './session.ts'
import type { Payload } from './payload.ts'

/**
 * 여러 테스터의 결과를 합쳐 게이트를 판정한다.
 *
 * 계측 파이프라인의 마지막 칸이다 — 재고(`session`), 꾸러미로 내보내고
 * (`payload`), 여기서 합친다. 손으로 합치면 가중 규칙을 틀리기 쉽고,
 * 게이트는 그 숫자 하나로 M2 진입을 결정한다.
 *
 * 합산 규칙은 `prompts/m1-gate.md` "합칠 때" 를 따른다.
 */

/** 판정에 필요한 최소 인원. 두세 명으로 90% 를 말할 수 없다. */
export const MIN_TESTERS = 5

/**
 * 게이트를 재는 난이도.
 *
 * 합격선(첫 클리어 8~15회, 재시도율 90%)은 **한 난이도에 대한 숫자다.**
 * 종자에서 10회와 성기사에서 10회는 다른 뜻이므로 섞어서 평균 내면 어느
 * 쪽도 아닌 값이 나온다. 기본값에서 재고, 나머지는 뺀다.
 */
export const GATE_DIFFICULTY = DEFAULT_DIFFICULTY

export interface Aggregate {
  readonly testers: number
  /** 사망 수로 가중한 재시도율. 재는 사망이 없으면 null */
  readonly retryRate: number | null
  readonly totalDeaths: number
  /** 프레임 수로 가중한 60fps 유지율 */
  readonly heldRate: number | null
  readonly totalFrames: number
  /** 클리어한 사람들의 시도 횟수 평균. 아무도 못 깼으면 null */
  readonly meanAttempts: number | null
  readonly cleared: number
  /** "죽는 연출이 좋았다" 비율. 응답자 기준 */
  readonly deathFxLiked: number | null
  readonly deathFxAnswered: number
  /** 가장 큰 초기 로드 (KB) */
  readonly worstLoadKB: number | null
  /** 가장 느린 사망 → 조작 복귀 (ms) */
  readonly worstRespawnMs: number
  /** 겹쳐 본 사망 구간. [시작 타일, 합계] — 많은 순 */
  readonly hotspots: readonly (readonly [number, number])[]
  /** 겹쳐 본 사인 */
  readonly causes: Readonly<Record<string, number>>
  /** 같은 id 로 두 번 들어온 것을 걸러낸 수 */
  readonly duplicatesDropped: number
  /** 낡은 형식이라 뺀 수 */
  readonly staleDropped: number
  /** 뺀 것들이 어느 버전이었나. [버전, 인원] */
  readonly stale: readonly (readonly [number, number])[]
  /**
   * 어느 빌드에서 잰 것들인가. [빌드, 인원] — 많은 순.
   *
   * 둘 이상이면 **사람이 판단해야 한다.** 오타 하나 고친 빌드와 밸런스를
   * 바꾼 빌드를 기계가 구분할 수 없으므로 자동으로 버리지 않는다.
   * 난이도·버전과 다른 점이다 — 그 둘은 다르면 무조건 못 섞는다.
   */
  readonly builds: readonly (readonly [string, number])[]
  /** 게이트 난이도가 아니라서 뺀 수 */
  readonly offDifficultyDropped: number
  /** 뺀 것들이 어느 난이도였나. [난이도, 인원] */
  readonly offDifficulty: readonly (readonly [string, number])[]
}

/**
 * 꾸러미들을 합친다.
 *
 * **같은 `id` 는 하나만 센다.** 한 사람이 두 번 붙여넣으면 그 사람의 무게가
 * 두 배가 되는데, 나중 것이 더 많이 플레이한 기록이므로 그쪽을 남긴다.
 */
export function aggregate(payloads: readonly Payload[]): Aggregate {
  const byId = new Map<string, Payload>()
  let duplicatesDropped = 0
  for (const payload of payloads) {
    const key = payload.id === '' ? `anon:${byId.size}` : payload.id
    const seen = byId.get(key)
    if (seen !== undefined) {
      duplicatesDropped += 1
      if (payload.playMin < seen.playMin) continue
    }
    byId.set(key, payload)
  }
  const received = [...byId.values()]

  // 낡은 형식은 뺀다. `SESSION_VERSION` 이 올랐다는 것은 **재는 방식이
  // 바뀌었다**는 뜻이다 — 같은 자리에 다른 뜻의 숫자가 들어 있으므로,
  // 합치면 어느 쪽도 아닌 값이 된다. 저장소는 이미 이 규칙으로 버린다.
  const all = received.filter((p) => p.v === SESSION_VERSION)
  const staleCounts = new Map<number, number>()
  for (const p of received) {
    if (p.v === SESSION_VERSION) continue
    staleCounts.set(p.v, (staleCounts.get(p.v) ?? 0) + 1)
  }

  // 게이트 난이도만 남긴다. 섞으면 합격선이 뜻을 잃는다.
  //
  // 값이 없으면 **빼는 쪽으로** 떨어진다. 버전이 맞는데 난이도가 없는 꾸러미는
  // 손댄 것이므로, 게이트 난이도로 넘겨짚어 조용히 넣는 것보다 낫다.
  const unique = all.filter((p) => p.diff === GATE_DIFFICULTY)
  const offCounts = new Map<string, number>()
  for (const p of all) {
    if (p.diff === GATE_DIFFICULTY) continue
    offCounts.set(p.diff, (offCounts.get(p.diff) ?? 0) + 1)
  }

  // 재시도율 — 사망 수로 가중한다. 두 번 죽은 사람과 서른 번 죽은 사람의
  // 무게가 같으면 안 된다.
  let retryWeighted = 0
  let retryDeaths = 0
  for (const p of unique) {
    if (p.retryRate === null || p.deaths === 0) continue
    retryWeighted += p.retryRate * p.deaths
    retryDeaths += p.deaths
  }

  // 유지율 — 프레임 수로 가중한다. 30초 한 사람과 10분 한 사람이 같을 수 없다.
  let heldWeighted = 0
  let frames = 0
  for (const p of unique) {
    if (p.fps.held === null || p.fps.samples === 0) continue
    heldWeighted += p.fps.held * p.fps.samples
    frames += p.fps.samples
  }

  const attempts = unique.map((p) => p.attempts).filter((a): a is number => a !== null)
  const answered = unique.filter((p) => p.survey.deathFxLiked !== null)
  const liked = answered.filter((p) => p.survey.deathFxLiked === true)

  const hotspots = new Map<number, number>()
  const causes: Record<string, number> = {}
  for (const p of unique) {
    for (const [tx, count] of p.hotspots) hotspots.set(tx, (hotspots.get(tx) ?? 0) + count)
    for (const [cause, count] of Object.entries(p.causes)) {
      causes[cause] = (causes[cause] ?? 0) + count
    }
  }

  const buildCounts = new Map<string, number>()
  for (const p of unique) {
    const id = p.build === '' ? UNKNOWN_BUILD : p.build
    buildCounts.set(id, (buildCounts.get(id) ?? 0) + 1)
  }

  const loads = unique.map((p) => p.loadKB).filter((k): k is number => k !== null)

  return {
    testers: unique.length,
    retryRate: retryDeaths === 0 ? null : retryWeighted / retryDeaths,
    totalDeaths: unique.reduce((sum, p) => sum + p.deaths, 0),
    heldRate: frames === 0 ? null : heldWeighted / frames,
    totalFrames: frames,
    meanAttempts: attempts.length === 0
      ? null
      : attempts.reduce((a, b) => a + b, 0) / attempts.length,
    cleared: unique.filter((p) => p.cleared).length,
    deathFxLiked: answered.length === 0 ? null : liked.length / answered.length,
    deathFxAnswered: answered.length,
    worstLoadKB: loads.length === 0 ? null : Math.max(...loads),
    worstRespawnMs: unique.reduce((worst, p) => Math.max(worst, p.worstRespawnMs), 0),
    hotspots: [...hotspots.entries()]
      .map(([tx, count]) => [tx, count] as const)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0]),
    causes,
    builds: [...buildCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    duplicatesDropped,
    staleDropped: received.length - all.length,
    stale: [...staleCounts.entries()].sort((a, b) => b[1] - a[1]),
    offDifficultyDropped: all.length - unique.length,
    offDifficulty: [...offCounts.entries()].sort((a, b) => b[1] - a[1]),
  }
}

export interface GateLine {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly target: string
  readonly verdict: Verdict
}

/**
 * 합친 값을 게이트 판정으로 바꾼다.
 *
 * **인원이 모자라면 pass 도 fail 도 아니다.** 표본 부족을 통과로 읽는 것이
 * 게이트를 무르는 가장 흔한 방법이다.
 */
export function gateVerdict(agg: Aggregate): readonly GateLine[] {
  const enough = agg.testers >= MIN_TESTERS

  return [
    line('retryRate', '사망 후 즉시 재시도율',
      agg.retryRate === null ? '-' : `${pct(agg.retryRate)} (사망 ${agg.totalDeaths})`,
      `${pct(GATE.retryRate)} 이상`,
      agg.retryRate === null || !enough || agg.totalDeaths < MIN_DEATHS * agg.testers
        ? 'unknown'
        : agg.retryRate >= GATE.retryRate ? 'pass' : 'fail'),

    line('fps', '60fps 유지율',
      agg.heldRate === null ? '-' : `${pct(agg.heldRate)} (프레임 ${agg.totalFrames.toLocaleString('en-US')})`,
      `${pct(GATE.heldRate)} 이상`,
      agg.heldRate === null || !enough
        ? 'unknown'
        : agg.heldRate >= GATE.heldRate ? 'pass' : 'fail'),

    line('attempts', '첫 클리어 시도 횟수',
      agg.meanAttempts === null ? `아무도 못 깸 (${agg.testers}명 중 0)` : `평균 ${agg.meanAttempts.toFixed(1)}회 (${agg.cleared}명)`,
      `${GATE.attempts.min}~${GATE.attempts.max}회`,
      agg.meanAttempts === null || !enough
        ? 'unknown'
        : agg.meanAttempts >= GATE.attempts.min && agg.meanAttempts <= GATE.attempts.max
          ? 'pass' : 'fail'),

    line('deathFx', '죽는 연출이 좋았다',
      agg.deathFxLiked === null ? '미응답' : `${pct(agg.deathFxLiked)} (응답 ${agg.deathFxAnswered})`,
      '70% 이상',
      agg.deathFxLiked === null || !enough
        ? 'unknown'
        : agg.deathFxLiked >= 0.7 ? 'pass' : 'fail'),

    line('load', '초기 로드',
      agg.worstLoadKB === null ? '-' : `${(agg.worstLoadKB / 1024).toFixed(2)}MB (최대)`,
      `${GATE.loadBytes / 1024 / 1024}MB 이하`,
      agg.worstLoadKB === null
        ? 'unknown'
        : agg.worstLoadKB * 1024 <= GATE.loadBytes ? 'pass' : 'fail'),

    line('controlBack', '사망 → 조작 가능',
      agg.worstRespawnMs === 0 ? '-' : `${(agg.worstRespawnMs / 1000).toFixed(2)}초 (최대)`,
      `${GATE.controlBackMs / 1000}초 이하`,
      agg.worstRespawnMs === 0
        ? 'unknown'
        : agg.worstRespawnMs <= GATE.controlBackMs ? 'pass' : 'fail'),
  ]
}

/** 전체 판정. 하나라도 fail 이면 fail, 하나라도 unknown 이면 unknown. */
export function overall(lines: readonly GateLine[]): Verdict {
  if (lines.some((l) => l.verdict === 'fail')) return 'fail'
  if (lines.some((l) => l.verdict === 'unknown')) return 'unknown'
  return 'pass'
}

function line(key: string, label: string, value: string, target: string, verdict: Verdict): GateLine {
  return { key, label, value, target, verdict }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}
