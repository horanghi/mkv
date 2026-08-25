import type { Stem } from './audio.ts'

/**
 * 스테이지 1 BGM 패턴 — 음산한 왈츠.
 *
 * docs/07 7.3 이 S1 을 **3/4 · 96 BPM · 첼레스타 · 낮은 현 · 종소리**로 규정한다.
 * 음원 파일 대신 합성으로 낸다 — 초기 로드 8MB 예산에서 BGM 한 곡이 차지할
 * 자리를 지금은 쓸 수 없고, 무음인 채로 "화려한가"를 물을 수도 없다.
 * → docs/07-audio.md 7.2 · 7.3, prompts/m1-gate.md
 *
 * 순수 데이터다. 소리를 내는 것은 `core/bgm.ts` 다.
 */

/** 어떤 곡을 연주하는가. 보스룸에 들어가면 바뀐다. → docs/07 7.2 */
export const THEMES = ['stage', 'boss'] as const
export type Theme = (typeof THEMES)[number]

/** 3/4 박자. 한 박을 8분음표 둘로 쪼갠다. */
export const STEPS_PER_BAR = 6
export const BARS = 8
export const TOTAL_STEPS = STEPS_PER_BAR * BARS

/**
 * 보스 테마 — 4/4. 왈츠와 박자가 달라야 방이 바뀐 것으로 들린다.
 *
 * docs/07 7.4 가 캐른을 "무겁고 느린 리프, 튜토리얼답게 단순" 으로 정했다.
 * 마디를 8스텝으로 늘려 같은 시계에서도 느리게 들리게 했다.
 */
export const BOSS_STEPS_PER_BAR = 8
export const BOSS_BARS = 4
export const BOSS_TOTAL_STEPS = BOSS_STEPS_PER_BAR * BOSS_BARS

/** docs/07 7.3 의 S1 템포. */
export const BASE_BPM = 96

/** 한 스텝의 길이 (초). 템포 배율을 곱해서 쓴다. */
export function stepSeconds(tempo: number): number {
  // 한 박 = 60/BPM, 8분음표는 그 절반이다.
  return (60 / (BASE_BPM * Math.max(0.1, tempo))) / 2
}

export interface Note {
  readonly hz: number
  /** 몇 스텝 동안 울리는가 */
  readonly steps: number
  /** 0~1 */
  readonly gain: number
}

const N = {
  G2: 98.0, A2: 110.0, Bb2: 116.54, D3: 146.83,
  G3: 196.0, A3: 220.0, Bb3: 233.08, Cs4: 277.18,
  D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, Bb4: 466.16,
  Cs5: 554.37, D5: 587.33, F5: 698.46, A5: 880.0,
} as const

/**
 * 8마디 화성 — i · i · VI · VI · iv · iv · V · V.
 *
 * 어두운 왈츠의 표준 진행이다. 마지막 두 마디의 V(A) 가 다시 i 로 돌아가며
 * 끝나지 않는 느낌을 만든다. 스테이지를 도는 동안 계속 흐르므로
 * 해결되지 않는 편이 낫다.
 */
interface Chord {
  readonly root: number
  /** 2·3박에 얹는 화음 */
  readonly upper: readonly number[]
}

const PROGRESSION: readonly Chord[] = [
  { root: N.D3 / 2, upper: [N.D4, N.F4, N.A4] },   // Dm
  { root: N.D3 / 2, upper: [N.D4, N.F4, N.A4] },
  { root: N.Bb2, upper: [N.Bb3, N.D4, N.F4] },     // Bb
  { root: N.Bb2, upper: [N.Bb3, N.D4, N.F4] },
  { root: N.G2, upper: [N.G3, N.Bb3, N.D4] },      // Gm
  { root: N.G2, upper: [N.G3, N.Bb3, N.D4] },
  { root: N.A2, upper: [N.A3, N.Cs4, N.E4] },      // A
  { root: N.A2, upper: [N.A3, N.Cs4, N.E4] },
]

/**
 * 첼레스타 선율. 마디마다 6스텝, `null` 은 쉼표.
 *
 * 8분음표를 다 채우지 않는다 — 왈츠는 쉼이 있어야 회전한다.
 */
const MELODY: readonly (number | null)[] = [
  N.A4, null, null, N.F4, null, null,
  N.D4, null, N.E4, N.F4, null, null,
  N.D4, null, null, N.Bb4, null, null,
  N.A4, null, null, null, null, null,
  N.G4, null, null, N.Bb4, null, null,
  N.A4, null, N.G4, N.F4, null, null,
  N.E4, null, null, N.Cs5, null, null,
  N.D5, null, null, null, null, null,
]

/** 종소리. 4마디마다 한 번. 낮고 길게 남는다. */
const BELL_STEPS = new Set([0, 4 * STEPS_PER_BAR])

/**
 * 이 스텝에서 시작하는 음들.
 *
 * 스템마다 다른 것을 낸다. 게인은 밖에서 믹스로 다시 곱하므로
 * 여기서는 스템 안에서의 상대 세기만 정한다.
 */
export function notesAt(stem: Stem, step: number, theme: Theme = 'stage'): readonly Note[] {
  if (theme === 'boss') return bossNotesAt(stem, step)

  const index = ((step % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS
  const bar = Math.floor(index / STEPS_PER_BAR)
  const beat = index % STEPS_PER_BAR
  const chord = PROGRESSION[bar] as Chord

  switch (stem) {
    case 'bass':
      // 낮은 현 — 1박에만. 왈츠의 무게중심이다.
      return beat === 0 ? [{ hz: chord.root, steps: 4, gain: 0.9 }] : []

    case 'rhythm':
      // 2·3박 화음. 왈츠를 왈츠로 만드는 것은 이 두 번의 얹음이다.
      if (beat !== 2 && beat !== 4) return []
      return chord.upper.map((hz) => ({ hz, steps: 1, gain: beat === 2 ? 0.5 : 0.38 }))

    case 'melody': {
      const hz = MELODY[index]
      return hz === null || hz === undefined ? [] : [{ hz, steps: 3, gain: 0.7 }]
    }

    case 'chorus':
      // 성가 — 마디 첫 박에 근음과 5도를 길게. 성유물 갑옷에서만 열린다.
      if (beat !== 0) return []
      return [
        { hz: chord.root * 4, steps: STEPS_PER_BAR, gain: 0.34 },
        { hz: chord.root * 6, steps: STEPS_PER_BAR, gain: 0.24 },
      ]

    case 'percussion':
      // 종소리. 잔여 30초에 열려 시간이 없다는 것을 알린다.
      return BELL_STEPS.has(index) ? [{ hz: N.D3, steps: STEPS_PER_BAR, gain: 0.8 }] : []

    default:
      return []
  }
}

/**
 * 보스 화성 — i · i · VI · V. 네 마디짜리 단순한 순환.
 *
 * 튜토리얼 보스라 복잡할 이유가 없다. 반복이 곧 패턴 학습의 박자가 된다.
 */
const BOSS_PROGRESSION: readonly Chord[] = [
  { root: N.D3 / 2, upper: [N.D4, N.F4, N.A4] },   // Dm
  { root: N.D3 / 2, upper: [N.D4, N.F4, N.A4] },
  { root: N.Bb2, upper: [N.Bb3, N.D4, N.F4] },     // Bb
  { root: N.A2, upper: [N.A3, N.Cs4, N.E4] },      // A
]

/** 보스 선율. 낮고 성기다 — 리프가 주인공이고 선율은 거든다. */
const BOSS_MELODY: readonly (number | null)[] = [
  N.D4, null, null, null, N.F4, null, null, null,
  N.D4, null, null, null, N.E4, null, null, null,
  N.F4, null, null, null, N.G4, null, null, null,
  N.E4, null, null, null, null, null, null, null,
]

function bossNotesAt(stem: Stem, step: number): readonly Note[] {
  const index = ((step % BOSS_TOTAL_STEPS) + BOSS_TOTAL_STEPS) % BOSS_TOTAL_STEPS
  const bar = Math.floor(index / BOSS_STEPS_PER_BAR)
  const beat = index % BOSS_STEPS_PER_BAR
  const chord = BOSS_PROGRESSION[bar] as Chord

  switch (stem) {
    case 'bass':
      // 1박과 3박. 4/4 의 무게중심이고, 길게 끌어 무겁게 만든다.
      return beat === 0 || beat === 4
        ? [{ hz: chord.root, steps: 4, gain: 1 }]
        : []

    case 'rhythm': {
      // 리프 — 뒷박에 5도를 짧게 찍는다. 이게 "무겁고 느린 리프" 의 몸통이다.
      if (beat % 2 !== 1) return []
      const fifth = chord.root * 3
      return [{ hz: fifth, steps: 1, gain: beat === 1 ? 0.55 : 0.35 }]
    }

    case 'melody': {
      const hz = BOSS_MELODY[index]
      return hz === null || hz === undefined ? [] : [{ hz, steps: 4, gain: 0.6 }]
    }

    case 'chorus':
      // 성유물을 입고 보스와 싸우면 성가가 얹힌다. 마디 전체를 깐다.
      return beat === 0 ? [{ hz: chord.root * 4, steps: BOSS_STEPS_PER_BAR, gain: 0.3 }] : []

    case 'percussion':
      // 마디 첫 박의 큰 타격. 보스전에서는 늘 울린다 — 패턴을 세는 박자다.
      return beat === 0 ? [{ hz: N.D3 / 2, steps: 2, gain: 0.9 }] : []

    default:
      return []
  }
}

/** 한 바퀴에 나오는 음 전체. 패턴이 비어 있지 않은지 확인하는 데 쓴다. */
export function loopNotes(stem: Stem, theme: Theme = 'stage'): readonly Note[] {
  const total = theme === 'boss' ? BOSS_TOTAL_STEPS : TOTAL_STEPS
  const out: Note[] = []
  for (let step = 0; step < total; step += 1) out.push(...notesAt(stem, step, theme))
  return out
}
