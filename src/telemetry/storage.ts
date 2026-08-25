import { parseDifficulty } from '../game/difficulty.ts'
import { BUCKETS, EMPTY_FRAMES, type FrameStats } from './frames.ts'
import { EMPTY_SURVEY, NEW_SESSION, SESSION_VERSION, type DeathRecord, type Session } from './session.ts'

/**
 * 세션 계측의 보존.
 *
 * 테스터는 한 번에 끝까지 하지 않는다. 탭을 닫았다 다시 열어도 시도 횟수와
 * 사망 기록이 이어져야 "첫 클리어까지 몇 회"를 잴 수 있다.
 *
 * `localStorage` 를 직접 잡지 않고 주입받는다. 그래야 브라우저 없이 테스트한다.
 */

export const STORAGE_KEY = 'grimhollow.playtest.v1'

/** localStorage 중 우리가 쓰는 부분만. 실패는 예외로 온다(사파리 프라이빗 등). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function save(store: KeyValueStore, session: Session): boolean {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(session))
    return true
  } catch {
    // 저장 못 해도 플레이는 계속돼야 한다. 계측이 게임을 막으면 안 된다.
    return false
  }
}

export function clear(store: KeyValueStore): void {
  try {
    store.removeItem(STORAGE_KEY)
  } catch {
    // 무시
  }
}

/**
 * 읽어온다. 없거나, 깨졌거나, 버전이 다르면 새 세션을 준다.
 *
 * 낡은 기록을 고쳐 쓰지 않는다 — 항목이 바뀌었다는 것은 재던 것이 바뀌었다는
 * 뜻이고, 섞으면 지표가 거짓이 된다.
 */
export function load(store: KeyValueStore): Session {
  let raw: string | null = null
  try {
    raw = store.getItem(STORAGE_KEY)
  } catch {
    return NEW_SESSION
  }
  if (raw === null) return NEW_SESSION

  try {
    return parseSession(JSON.parse(raw) as unknown)
  } catch {
    return NEW_SESSION
  }
}

export function parseSession(value: unknown): Session {
  if (!isRecord(value)) return NEW_SESSION
  if (value['version'] !== SESSION_VERSION) return NEW_SESSION

  const survey = isRecord(value['survey']) ? value['survey'] : {}

  return {
    version: SESSION_VERSION,
    difficulty: parseDifficulty(value['difficulty']),
    id: typeof value['id'] === 'string' ? value['id'] : '',
    playMs: num(value['playMs']),
    deaths: parseDeaths(value['deaths']),
    clears: num(value['clears']),
    attemptsToFirstClear: nullableNum(value['attemptsToFirstClear']),
    msToFirstClear: nullableNum(value['msToFirstClear']),
    bossReached: value['bossReached'] === true,
    hurts: num(value['hurts']),
    armorBreaks: num(value['armorBreaks']),
    frames: parseFrames(value['frames']),
    survey: {
      deathFxLiked: nullableBool(survey['deathFxLiked']),
      jumpStiff: nullableBool(survey['jumpStiff']),
      note: typeof survey['note'] === 'string' ? survey['note'] : EMPTY_SURVEY.note,
    },
  }
}

function parseDeaths(value: unknown): readonly DeathRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((entry) => ({
    x: num(entry['x']),
    cause: typeof entry['cause'] === 'string' ? (entry['cause'] as DeathRecord['cause']) : null,
    atMs: num(entry['atMs']),
    controlBackMs: nullableNum(entry['controlBackMs']),
    retried: nullableBool(entry['retried']),
  }))
}

function parseFrames(value: unknown): FrameStats {
  if (!isRecord(value)) return EMPTY_FRAMES

  const raw = value['buckets']
  const buckets = new Array<number>(BUCKETS).fill(0)
  if (Array.isArray(raw)) {
    for (let i = 0; i < BUCKETS; i += 1) buckets[i] = num(raw[i])
  }

  return {
    samples: num(value['samples']),
    held: num(value['held']),
    discarded: num(value['discarded']),
    buckets,
    worstMs: num(value['worstMs']),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function nullableNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}
