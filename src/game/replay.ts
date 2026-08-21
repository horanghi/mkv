import { INITIAL_INPUT, advanceInput, type InputFrame, type InputState } from '../core/input.ts'

/**
 * 리플레이 — 결정론의 증명 도구.
 *
 * 입력 비트마스크 배열을 틱 순서대로 흘려 넣고 최종 상태를 얻는다.
 * 물리·밸런스를 고친 뒤 같은 리플레이를 돌렸을 때 결과가 달라지면
 * "사람 눈에 안 보이는 1px 변화"를 잡아낸 것이다.
 *
 * → docs/10-tech-spec.md 10.3, 10.9
 */

export type ReplayStep<S> = (state: S, input: InputState, tick: number) => S

export interface Replay {
  /** 난수 시드. 로직이 난수를 쓰면 이것도 함께 고정해야 재현된다. */
  readonly seed: number
  /** 틱당 입력 하나. */
  readonly frames: readonly InputFrame[]
}

export interface ReplayResult<S> {
  readonly state: S
  readonly input: InputState
  readonly ticks: number
}

export function runReplay<S>(
  initial: S,
  step: ReplayStep<S>,
  replay: Replay,
): ReplayResult<S> {
  let state = initial
  let input = INITIAL_INPUT

  let tick = 0
  for (const frame of replay.frames) {
    input = advanceInput(input, frame)
    state = step(state, input, tick)
    tick += 1
  }

  return { state, input, ticks: replay.frames.length }
}

/**
 * 구조 해시. 골든 테스트가 최종 상태를 숫자 하나로 비교하게 해준다.
 *
 * FNV-1a 32비트. 암호용이 아니라 회귀 감지용이다.
 */
export function hashState(value: unknown): number {
  let hash = 0x811c9dc5
  const text = canonical(value)
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** 리플레이를 문자열로. 버그 리포트에 붙여 보내기 위한 것이다. */
export function encodeReplay(replay: Replay): string {
  return `${replay.seed.toString(36)}:${replay.frames.map((f) => f.toString(36)).join(',')}`
}

export function decodeReplay(text: string): Replay {
  const separator = text.indexOf(':')
  if (separator < 0) throw new Error(`리플레이 형식이 아니다: ${text.slice(0, 32)}`)

  const seed = Number.parseInt(text.slice(0, separator), 36)
  if (Number.isNaN(seed)) throw new Error('시드를 읽을 수 없다')

  const body = text.slice(separator + 1)
  const frames = body === '' ? [] : body.split(',').map(toFrame)
  return { seed, frames }
}

function toFrame(token: string): InputFrame {
  const frame = Number.parseInt(token, 36)
  if (Number.isNaN(frame)) throw new Error(`입력 프레임을 읽을 수 없다: "${token}"`)
  return frame
}

/** 키 순서에 의존하지 않는 직렬화. 객체 리터럴 순서가 바뀌어도 해시가 안 흔들린다. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}
