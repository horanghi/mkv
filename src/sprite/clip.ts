import type { Pose } from './pose.ts'

/**
 * 클립 — 포즈 목록과 재생 상태.
 *
 * **클립 데이터는 갑옷 상태와 무관하다.** 성유물·강철·속옷·백골이 같은 클립을 쓴다.
 * 그래서 상태를 바꿔도 프레임 인덱스가 흔들리지 않는다 — 재생 상태에 갑옷이
 * 들어 있지 않으므로 구조적으로 그럴 수가 없다.
 * → docs/12-sprites.md 12.6
 */

export const CLIP_NAMES = [
  'idle', 'walk', 'jump', 'attack', 'crouch', 'land', 'hurt', 'ladder',
] as const
export type ClipName = (typeof CLIP_NAMES)[number]

export interface Clip {
  readonly fps: number
  readonly keys: readonly Pose[]
  /** 끝나면 처음으로 돌아가는가. false 면 마지막 프레임에서 멈춘다. */
  readonly loop: boolean
  /** 시간이 아니라 물리 상태가 프레임을 고른다 (점프). */
  readonly manual?: boolean
}

export const CLIPS: Readonly<Record<ClipName, Clip>> = {
  idle: { fps: 4, loop: true, keys: [{}, { dy: 1 }] },

  walk: { fps: 12, loop: true, keys: [
    { lf: 2, lb: -2, af: -1, ab: 1 }, { lf: 1, lb: -1, af: -1, ab: 1 },
    { lf: 0, lb: 0, dy: -1 },         { lf: -1, lb: 1, af: 1, ab: -1 },
    { lf: -2, lb: 2, af: 1, ab: -1 }, { lf: -1, lb: 1, af: 1, ab: -1 },
    { lf: 0, lb: 0, dy: -1 },         { lf: 1, lb: -1, af: -1, ab: 1 },
  ]},

  // 프레임을 시간이 아니라 물리가 고른다 — 웅크림·도약·정점·하강.
  jump: { fps: 8, loop: false, manual: true, keys: [
    { dy: 2, legY: -1, af: -1 },
    { dy: -1, lf: 1, lb: -1, afy: -2 },
    { dy: -1, lf: 2, lb: -2, afy: -1 },
    { dy: 0, lf: 1, lb: -2, afy: 1 },
  ]},

  // 2프레임(인덱스 1)에서 투사체가 나간다. docs/02 발사 딜레이 3f 와 맞춘 타이밍이다.
  attack: { fps: 10, loop: false, keys: [
    { af: -2, afy: 1, wpn: [12, 19] },
    { af: 2, afy: -2, wpn: [20, 16] },
    { af: 2, afy: -1, wpn: [25, 17] },
    { af: 1, wpn: [31, 17] },
  ]},

  crouch: { fps: 6, loop: true, keys: [
    { dy: 4, legY: -4, af: -1 }, { dy: 5, legY: -5, af: -1 },
  ]},

  land: { fps: 14, loop: false, keys: [
    { dy: 4, legY: -4, af: 1, ab: -1, afy: 2 },
    { dy: 2, legY: -2, af: 1, ab: -1, afy: 1 },
    { dy: 0 },
  ]},

  hurt: { fps: 12, loop: false, keys: [
    { lean: -2, dy: -1, af: -2, afy: -4, ab: 1, aby: -2, lf: -1, lb: 1 },
    { lean: -3, af: -3, afy: -3, ab: 1, aby: -1, lf: -2, lb: 2 },
    { lean: -1, af: -1, afy: -1, ab: 1, lf: -1, lb: 1 },
  ]},

  ladder: { fps: 8, loop: true, keys: [
    { af: 1, afy: -6, aby: 1, lf: -1, lfy: -3, lb: 1, lby: 1 },
    { af: 1, afy: -3, aby: -1, lfy: -1, lby: -1 },
    { af: 0, afy: 1, ab: 1, aby: -6, lf: 1, lfy: 1, lb: -1, lby: -3 },
    { af: 0, afy: -1, ab: 1, aby: -3, lfy: -1, lby: -1 },
  ]},
}

/** 투사체가 나가는 프레임. `attack` 클립 기준. */
export const ATTACK_RELEASE_FRAME = 1

export interface ClipState {
  readonly name: ClipName
  readonly frame: number
  /** 현재 프레임에 머문 시간 */
  readonly elapsedMs: number
  /** 반복하지 않는 클립이 마지막 프레임에 도달했는가 */
  readonly finished: boolean
  /** 이번 갱신에서 프레임이 넘어갔는가. 투사체 스폰 신호로 쓴다. */
  readonly advanced: boolean
}

export function startClip(name: ClipName): ClipState {
  return { name, frame: 0, elapsedMs: 0, finished: false, advanced: true }
}

/**
 * 클립을 바꾼다. **같은 클립이면 상태를 그대로 둔다.**
 *
 * 호출부가 매 틱 `play(state, 'walk')` 를 부르는 것이 자연스러운데,
 * 그때마다 0으로 되돌리면 걷기가 첫 프레임에 얼어붙는다.
 */
export function playClip(state: ClipState, name: ClipName): ClipState {
  if (state.name === name) return state
  return startClip(name)
}

/** 한 프레임 시간(ms). */
export function frameDurationMs(clip: Clip): number {
  return 1000 / clip.fps
}

/**
 * 시간을 흘려보낸다.
 *
 * 한 번 호출에 여러 프레임을 건너뛸 수 있다 — 프레임이 밀려도 애니메이션
 * 속도가 느려지지 않는다. 물리 틱과 같은 원칙이다.
 */
export function advanceClip(state: ClipState, dtMs: number): ClipState {
  const clip = CLIPS[state.name]
  if (clip.manual || state.finished) return { ...state, advanced: false }

  const step = frameDurationMs(clip)
  const total = state.elapsedMs + Math.max(0, dtMs)
  const steps = Math.floor(total / step)
  if (steps === 0) return { ...state, elapsedMs: total, advanced: false }

  const count = clip.keys.length
  const raw = state.frame + steps

  if (!clip.loop && raw >= count - 1) {
    return { ...state, frame: count - 1, elapsedMs: 0, finished: true, advanced: true }
  }
  return {
    ...state,
    frame: raw % count,
    elapsedMs: total - steps * step,
    finished: false,
    advanced: true,
  }
}

/** 물리가 고르는 점프 프레임. 0 웅크림 · 1 도약 · 2 정점 · 3 하강 */
export function jumpFrame(vy: number, apexThreshold = 60): 0 | 1 | 2 | 3 {
  if (vy < -apexThreshold) return 1
  if (vy < apexThreshold) return 2
  return 3
}

/** 지금 프레임의 포즈. */
export function currentPose(state: ClipState): Pose {
  const clip = CLIPS[state.name]
  return clip.keys[Math.min(state.frame, clip.keys.length - 1)] ?? {}
}

/** `attack` 클립이 이번 틱에 투사체를 놓는가. */
export function releasesProjectile(state: ClipState): boolean {
  return state.name === 'attack' && state.advanced && state.frame === ATTACK_RELEASE_FRAME
}
