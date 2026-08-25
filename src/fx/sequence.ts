/**
 * 연출 타임라인.
 *
 * 갑옷 파괴는 300ms 안에 여덟 가지가 순서대로 일어난다. 각 효과가 스스로
 * 타이머를 들고 있으면 순서가 어긋났을 때 어디가 틀렸는지 알 수 없다.
 * **시각과 이벤트를 데이터로 적어두고 한 곳에서 흘린다.**
 * → docs/06-visual-direction.md 6.3
 */

export interface Cue<T extends string> {
  /** 시퀀스 시작으로부터의 밀리초 */
  readonly at: number
  readonly event: T
}

export interface Timeline<T extends string> {
  readonly durationMs: number
  readonly cues: readonly Cue<T>[]
}

export interface SequenceState {
  readonly elapsedMs: number
  /** 이미 발화한 큐 개수. 큐가 시각 순으로 정렬돼 있어 개수만으로 충분하다. */
  readonly fired: number
  readonly done: boolean
}

export const IDLE_SEQUENCE: SequenceState = Object.freeze({
  elapsedMs: 0,
  fired: 0,
  done: true,
})

export function startSequence(): SequenceState {
  return { elapsedMs: 0, fired: 0, done: false }
}

export interface SequenceStep<T extends string> {
  readonly state: SequenceState
  /** 이번 갱신에서 발화한 이벤트. 순서가 보장된다. */
  readonly fired: readonly T[]
}

/**
 * 시간을 흘린다.
 *
 * 한 번에 여러 큐를 지나가도 **전부 순서대로** 발화한다. 프레임이 밀렸다고
 * 섬광이 빠지면 연출이 무너진다.
 */
export function advanceSequence<T extends string>(
  timeline: Timeline<T>,
  state: SequenceState,
  dtMs: number,
): SequenceStep<T> {
  if (state.done) return { state, fired: [] }

  const elapsedMs = state.elapsedMs + Math.max(0, dtMs)
  const fired: T[] = []
  let index = state.fired

  while (index < timeline.cues.length) {
    const cue = timeline.cues[index]
    if (!cue || cue.at > elapsedMs) break
    fired.push(cue.event)
    index += 1
  }

  return {
    state: { elapsedMs, fired: index, done: elapsedMs >= timeline.durationMs },
    fired,
  }
}

/** 시퀀스 시작 이후 경과 비율 [0, 1]. 페이드·확장에 쓴다. */
export function progressAt(state: SequenceState, startMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1
  return clamp01((state.elapsedMs - startMs) / durationMs)
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.min(1, Math.max(0, v))
}

// ── 갑옷 파괴 ────────────────────────────────────────────────────────────────

export const ARMOR_BREAK_EVENTS = [
  'hitstop', 'flash', 'shards', 'ring', 'aberration', 'invert', 'shake', 'resume',
] as const
export type ArmorBreakEvent = (typeof ARMOR_BREAK_EVENTS)[number]

/** docs/06 6.3 의 표를 그대로 옮긴 것이다. 수치를 바꾸면 표도 함께 고친다. */
export const ARMOR_BREAK: Timeline<ArmorBreakEvent> = {
  durationMs: 3000,
  cues: [
    { at: 0, event: 'hitstop' },
    { at: 0, event: 'flash' },
    { at: 40, event: 'shards' },
    { at: 40, event: 'ring' },
    { at: 40, event: 'aberration' },
    { at: 60, event: 'invert' },
    { at: 100, event: 'shake' },
    { at: 180, event: 'resume' },
  ],
}

export const ARMOR_BREAK_TIMING = {
  hitstopMs: 180,
  flashMs: 40,
  ringMs: 140,
  ringRadius: { from: 8, to: 96 },
  aberration: { peak: 0.8, durationMs: 140 },
  invertMs: 16,
  shake: { amplitude: 6, durationMs: 300, frequencyHz: 28 },
  shardCount: 24,
  shardHoldMs: 3000,
} as const

// ── 사망 ─────────────────────────────────────────────────────────────────────

export const DEATH_EVENTS = ['hitstop', 'skeletonize', 'shatter', 'slowmo', 'fade', 'respawn'] as const
export type DeathEvent = (typeof DEATH_EVENTS)[number]

/** 총 1.25초. 이후 리스폰까지 합쳐 3초 예산 안에 들어간다. → docs/02 2.6 */
export const DEATH: Timeline<DeathEvent> = {
  durationMs: 1250,
  cues: [
    { at: 0, event: 'hitstop' },
    { at: 0, event: 'skeletonize' },
    { at: 250, event: 'shatter' },
    { at: 250, event: 'slowmo' },
    { at: 1250, event: 'fade' },
    { at: 1250, event: 'respawn' },
  ],
}

export const DEATH_TIMING = {
  hitstopMs: 250,
  skeletonizeMs: 250,
  skeletonizeFrames: 8,
  slowmo: { scale: 0.3, durationMs: 1000 },
  shake: { amplitude: 10, durationMs: 600, frequencyHz: 22 },
  boneCount: 12,
} as const
