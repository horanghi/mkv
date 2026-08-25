import { blankFrame, freezeFrame, stamp, validateAll, type Matrix } from './matrix.ts'
import type { Palette } from './palette.ts'

/**
 * 캐른 — 스테이지 1 보스. 56×52.
 *
 * 도트는 `tools/sprite/cairn.py` 가 만든 것을 그대로 옮겼다. 56×52 는 손으로
 * 세기에는 크다 — 이전 도트 작업의 실패가 전부 행 길이 오차였다.
 * → tools/sprite/README.md
 *
 * **파츠 분할이 곧 페이즈 3 메카닉이다.** 렌더 편의로 나눈 것이 아니라
 * 분해되는 파편 4개가 그대로 판정 단위다. 분할을 바꾸면 패턴이 바뀐다.
 * → docs/12-sprites.md 12.10
 */

/** docs/12 12.10 팔레트. 1~4 는 돌, 5~6 은 뼈, 7~9 는 코어 인광. */
export const PAL_CAIRN: Palette = {
  '0': '#0B0710', '1': '#8E97A8', '2': '#6B7385', '3': '#4A5163', '4': '#2F3444',
  '5': '#EDE6D8', '6': '#A99C8A', '7': '#C9A6E8', '8': '#8B4FD6', '9': '#4A2278',
}

export const CAIRN_WIDTH = 56
export const CAIRN_HEIGHT = 52

const PARTS_RAW = {
  HEAD: [
    '......000000........',
    '...00012222300......',
    '.001122222223300....',
    '.01112222222233300..',
    '.011122222222223330.',
    '.015552222222223330.',
    '.015005222225553330.',
    '.015555222250053330.',
    '..01662222255553330.',
    '...0111222226623330.',
    '....02222222223400..',
    '....033333333400....',
    '.....003333400......',
    '.......00000........',
  ],
  TORSO: [
    '...........000000000000...........',
    '.......0000112222222333000........',
    '...0000111122222222222333300......',
    '.00111112222222222222223333300....',
    '.01111122222220110222222333333000.',
    '0111111222222201102222222233333330',
    '0111111222222222222222222233333330',
    '.011111122222222222222222223333330',
    '011111122222222222222222655333330.',
    '.01111555622222222222222523033330.',
    '.0011501206222222222222225563330..',
    '...011555622222222222222233333300.',
    '..01111122222222222222223333330...',
    '...001111122222222222222333011....',
    '.....01111222222222222223330110...',
    '.....011155222222222222334440.....',
    '......0050062222222556233440......',
    '........02222222222266344000......',
    '........00333333333333440.........',
    '..........00333333333400..........',
    '............0033333400............',
    '..............000000..............',
  ],
  ARM: [
    '000000000000',
    '011222222330',
    '011222222330',
    '01122222330.',
    '01122222330.',
    '0112222330..',
    '0112222330..',
    '0112222330..',
    '011222330...',
    '011222330...',
    '011222330...',
    '0112222330..',
    '01122222340.',
    '022222222340',
    '033133133340',
    '033133133340',
    '03333333400.',
    '000000000...',
  ],
  ARM_BACK: [
    '000000000000',
    '044333333330',
    '044333333330',
    '.04433333330',
    '.04433333330',
    '..0443333330',
    '..0443333330',
    '..0443333330',
    '...044333330',
    '...044333330',
    '...044333330',
    '..0443333330',
    '.04433333330',
    '044333333330',
    '044443443440',
    '044443443440',
    '.00444444440',
    '...000000000',
  ],
  BASE: [
    '........................................................',
    '........................................................',
    '.................................00000..................',
    '....................00000000000..02220..................',
    '.........00000000000011111111100002220..................',
    '.......001111122222201111111110330222000000.............',
    '..00000000000000222201111111110220000033333000000.......',
    '..01111111111110222201111111110222222200000000000000....',
    '..0011111111111102220000000000022222220111111111110300..',
    '.011011111111110000222222222222222222220111111111110330.',
    '0111100000000000220222222222222222222222000000000000030.',
    '01111111111222202202222222222222222222222222333334444440',
    '02222222222222200002222222222222222222222222333334444440',
    '03333333333333333333333333333333333333333333333334444440',
    '03333333333333333333333333333333333333333333333334444440',
    '00000000000000000000000000000000000000000000000000000000',
  ],
  CORE: [
    '...9999...',
    '..978899..',
    '.97888899.',
    '9778888999',
    '9778888999',
    '9778888999',
    '9778888999',
    '.98888899.',
    '..999999..',
    '...9999...',
  ],
} as const

export type CairnPart = keyof typeof PARTS_RAW

export const CAIRN_PARTS: Readonly<Record<CairnPart, Matrix>> = PARTS_RAW

/**
 * 파츠 기준 위치.
 *
 * 팔은 어깨가 몸통 안에 묻혀야 한다. 닿기만 하면 떨어져 보인다.
 * → docs/12 12.10, tools/sprite/README.md
 */
export const CAIRN_OFFSETS = {
  BASE: [0, 36], TORSO: [11, 16], HEAD: [18, 5],
  ARM_B: [2, 21], ARM_F: [42, 21], CORE: [23, 26],
} as const

/**
 * 파편 4개가 어느 파츠인가.
 *
 * `entities/bosses/cairn.ts` 의 `makeFragments` 순서와 **반드시 같아야 한다** —
 * 어긋나면 머리가 기단 자리에서 날아온다. 테스트가 오프셋으로 이 관계를 검사한다.
 */
export const FRAGMENT_PARTS: readonly CairnPart[] = ['HEAD', 'ARM_BACK', 'ARM', 'BASE']

export interface CairnPose {
  /** 전신 상하 */
  readonly dy?: number
  /** 양팔 상하 — 강타 예비/타격 */
  readonly armDy?: number
  /** 앞팔 좌우 — 던지기 */
  readonly armDx?: number
  /** 분해 상태. 코어만 남는다 */
  readonly coreOnly?: boolean
}

/**
 * 한 프레임을 조립한다.
 *
 * 뒤에서 앞으로: BASE → ARM_BACK → TORSO → CORE → HEAD → ARM.
 * 순서가 바뀌면 앞팔이 몸통에 가려진다.
 */
export function cairnFrame(pose: CairnPose = {}): Matrix {
  const frame = blankFrame(CAIRN_WIDTH, CAIRN_HEIGHT)
  const dy = pose.dy ?? 0
  const armDy = pose.armDy ?? 0
  const armDx = pose.armDx ?? 0

  if (pose.coreOnly === true) {
    stamp(frame, CAIRN_PARTS.CORE, CAIRN_OFFSETS.CORE[0], CAIRN_OFFSETS.CORE[1] + dy)
    return freezeFrame(frame)
  }

  stamp(frame, CAIRN_PARTS.BASE, CAIRN_OFFSETS.BASE[0], CAIRN_OFFSETS.BASE[1])
  stamp(frame, CAIRN_PARTS.ARM_BACK, CAIRN_OFFSETS.ARM_B[0], CAIRN_OFFSETS.ARM_B[1] + dy + armDy)
  stamp(frame, CAIRN_PARTS.TORSO, CAIRN_OFFSETS.TORSO[0], CAIRN_OFFSETS.TORSO[1] + dy)
  stamp(frame, CAIRN_PARTS.CORE, CAIRN_OFFSETS.CORE[0], CAIRN_OFFSETS.CORE[1] + dy)
  stamp(frame, CAIRN_PARTS.HEAD, CAIRN_OFFSETS.HEAD[0], CAIRN_OFFSETS.HEAD[1] + dy)
  stamp(frame, CAIRN_PARTS.ARM, CAIRN_OFFSETS.ARM_F[0] + armDx, CAIRN_OFFSETS.ARM_F[1] + dy + armDy)
  return freezeFrame(frame)
}

/**
 * 상태와 경과 프레임에서 포즈를 정한다.
 *
 * docs/12 12.10 의 클립 표를 그대로 옮긴 것이다. 프레임 수는
 * `entities/bosses/cairn.ts` 의 `CAIRN` 상수와 맞춰야 한다 — 어긋나면
 * 예비 동작이 끝난 뒤에도 팔이 들려 있어 "언제 맞는지"를 읽을 수 없다.
 *
 * 순수 함수라 렌더 없이 검증한다.
 */
export function cairnPose(state: string, stateFrames: number, tick: number): CairnPose {
  switch (state) {
    case 'slam':
      // 예비 30프레임 동안 팔을 들고 있는다. 예비가 길어야 공정하다.
      return stateFrames < 30 ? { armDy: -6 } : { armDy: 10, dy: 1 }
    case 'throw':
      return stateFrames < 26 ? { armDx: -4 } : { armDx: 6 }
    case 'quake':
      return stateFrames < 34 ? { armDy: -4 } : { armDy: 8, dy: 2 }
    case 'split':
      // 예비가 끝나면 파편이 떨어져 나가고 코어만 남는다.
      return stateFrames < 30 ? { dy: 1 } : { coreOnly: true }
    case 'merge':
      return { coreOnly: stateFrames < 24 }
    default:
      // 느린 호흡. 크고 느리다는 것을 정지 상태에서 알린다. (3fps = 20틱)
      return { dy: Math.floor(tick / 20) % 2 }
  }
}

/** 파편 하나. 분해 상태에서 각자 날아다닌다. */
export function fragmentFrame(index: number): Matrix {
  const part = FRAGMENT_PARTS[index] ?? 'HEAD'
  return CAIRN_PARTS[part]
}

validateAll('cairn', CAIRN_PARTS)
