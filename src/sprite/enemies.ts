import { validateAll, type Matrix } from './matrix.ts'
import type { Palette } from './palette.ts'

/**
 * 잡몹 도트.
 *
 * 랜슬과 달리 파츠 조립을 하지 않는다. 12×22 크기에서 파츠를 나누면
 * 접합부가 스프라이트보다 커진다. 프레임 전체를 통으로 찍는다.
 *
 * **스프라이트 크기 = 히트박스 크기.** docs/02 2.1 의 원칙은 "판정이 보이는 것보다
 * 크지 않다"이고, 1:1 은 그 하한이다. 보이는 것보다 판정이 크면
 * "왜 죽었는지 모르겠다"가 되고, 그건 어려운 게 아니라 불공정한 것이다.
 * → prompts/m1-gate.md 진단표
 *
 * → docs/12-sprites.md
 */

/** 좀비 — 썩은 살, 뼈가 드러난 이빨. 색은 docs/12 12.9 의 `PAL_GHOUL`. */
export const PAL_GHOUL: Palette = {
  '0': '#0B0710', G: '#7A9660', g: '#4E6B3C', L: '#A8C08A',
  '9': '#EDE6D8', R: '#A8323F',
}

/**
 * 그림 — 붉은 몸에 **노란 눈**. 색은 docs/12 12.8 의 `PAL_GRIMM`.
 *
 * 노란 눈이 이 스프라이트에서 유일한 고채도 색이다. 장식이 아니라 공정성
 * 장치다 — 어두운 스테이지 1 에서 그림의 위치를 즉시 읽지 못하면
 * 고정 점프 궤도 때문에 회피할 수 없는 죽음이 된다. → docs/12 12.8
 */
export const PAL_GRIMM: Palette = {
  '0': '#0B0710', S: '#A32332', s: '#6E1826', L: '#E23E4E', R: '#FFD84A',
}

/**
 * 까마귀 — 깃털에 노란 부리.
 *
 * 순수한 검정으로 두면 어두운 배경에 묻힌다. 급강하로 죽이는 적이 안 보이면
 * "왜 죽었는지 모름"이 되므로, 배경 실루엣보다 확실히 밝게 잡았다.
 * → prompts/m1-gate.md 진단표
 */
export const PAL_CORVID: Palette = {
  '0': '#0B0710', K: '#4A3C5E', k: '#251D33', L: '#6A5E88', Y: '#FFD84A',
}

/**
 * 좀비 12×22 — **옆모습.** 걷기 2프레임.
 *
 * 횡스크롤에서 정면을 보면 어느 쪽으로 걸어오는지 읽을 수 없다. 옆모습이라야
 * 눈 하나·앞으로 뻗은 팔·엇갈린 다리가 진행 방향을 말한다.
 * 렌더러가 `scale.x = enemy.facing` 으로 뒤집으므로 **오른쪽을 보게** 그린다.
 */
const GHOUL_WALK_A: Matrix = [
  '....0000....',
  '...0GGGG0...',
  '..0GGLLLG0..',
  '..0GGL0LG0..',
  '..0GGLLG990.',
  '..0GgGG9990.',
  '...0GggG00..',
  '....0GG0....',
  '..00GGGG0...',
  '.0GgGGGGG0..',
  '.0GGGGGGGG00',
  '.0GgGGGg0999',
  '..0GGGGG00..',
  '..0GgGGG0...',
  '..0GGGGGG0..',
  '..0GG00GG0..',
  '..0GG0.0G0..',
  '..0Gg0.0G0..',
  '..0GG0.0g0..',
  '.0GG0..0g0..',
  '.0Gg0..0g0..',
  '.0990..0990.',
]

const GHOUL_WALK_B: Matrix = [
  '....0000....',
  '...0GGGG0...',
  '..0GGLLLG0..',
  '..0GGL0LG0..',
  '..0GGLLG990.',
  '..0GgGG9990.',
  '...0GggG00..',
  '....0GG0....',
  '..00GGGG0...',
  '.0GgGGGGG0..',
  '..0GGGGGG000',
  '..0GgGGGg099',
  '..0GGGGG00..',
  '..0GgGGG0...',
  '..0GGGGGG0..',
  '...0GGGG0...',
  '...0GgGG0...',
  '..0GG00GG0..',
  '..0Gg0.0G0..',
  '..0GG0.0g0..',
  '.0Gg0..0GG0.',
  '.0990..0990.',
]

/** 땅에서 솟는 중. 아래가 흙에 묻혀 있다. */
const GHOUL_RISE: Matrix = [
  '............',
  '............',
  '............',
  '............',
  '............',
  '....0000....',
  '...0GGGG0...',
  '..0GGLLLG0..',
  '..0GGL0LG0..',
  '..0GGLLG990.',
  '..0GgGG9990.',
  '...0GggG00..',
  '....0GG0....',
  '..00GGGG0...',
  '.0GgGGGGG0..',
  '.0GGGGGGGG00',
  '.0GgGGGg0999',
  '..0GGGGG00..',
  '..0GgGGG0...',
  '..0gggggg0..',
  '...000000...',
  '............',
]

/**
 * 그림 14×16 — **옆모습.** 떠 있는 그림자, 대기 상태는 웅크린다.
 *
 * 날개는 뒤(왼쪽)로, 머리는 앞(오른쪽)으로 간다. 노란 눈이 하나만 보이는
 * 대신 앞쪽에 붙어 있어 어디를 노리는지가 읽힌다.
 */
const GRIMM_FLY_A: Matrix = [
  '..000.........',
  '.0SSS0........',
  '.0SSSS0.......',
  '0SsSSSSS0.....',
  '0SsssSSSS0000.',
  '0SsssSSSSSSSS0',
  '.0SsssSSSLRR0.',
  '.0SssssSSSSS0.',
  '..0SsssSSSS0..',
  '..0SssSSSS0...',
  '...0SsSSS0....',
  '...0SsSS0.....',
  '....0s0s0.....',
  '....0.0.0.....',
  '..............',
  '..............',
]

const GRIMM_FLY_B: Matrix = [
  '..............',
  '..............',
  '.0............',
  '0S0...........',
  '0SS0......000.',
  '0SSS0...0SSSS0',
  '.0SSS0.0SLRR0.',
  '.0SsSSSSSSSS0.',
  '..0SsssSSSS0..',
  '..0SssssSSS0..',
  '...0SsssSS0...',
  '...0SssSS0....',
  '....0SsS0.....',
  '....0s0s0.....',
  '.....0.0......',
  '..............',
]

/** 대기 — 웅크려 있다. 노란 점 하나로 "여기 있다"를 알린다. */
const GRIMM_DORMANT: Matrix = [
  '..............',
  '..............',
  '..............',
  '..............',
  '..0000........',
  '.0SSSS0.000...',
  '0SsSSSSS0SSS0.',
  '0SsssSSSSLRR0.',
  '0SsssSSSSSSS0.',
  '.0SsssSSSSS0..',
  '.0SssssSSS0...',
  '..0SsssSS0....',
  '..0SssSS0.....',
  '...0ssss0.....',
  '....0000......',
  '..............',
]

/** 까마귀 12×10 — 옆모습. 날개 위/아래 2프레임. 부리는 오른쪽. */
const CORVID_UP: Matrix = [
  '..00....00..',
  '.0KK0..0KK0.',
  '.0KK0..0KK0.',
  '..0KK00KK0..',
  '..0KKKKKK0Y0',
  '..0KkkkkK00.',
  '...0KKKK0...',
  '....0KK0....',
  '.....00.....',
  '............',
]

const CORVID_DOWN: Matrix = [
  '............',
  '.00......00.',
  '0KK0....0KK0',
  '.0KK0kk0KK0.',
  '..0KKKKKK0Y0',
  '..0KkkkkK00.',
  '...0KKKK0...',
  '....0KK0....',
  '.....00.....',
  '............',
]

export interface EnemySprite {
  readonly palette: Palette
  readonly width: number
  readonly height: number
  /** 상태별 프레임. 없는 상태는 `default` 로 떨어진다 */
  readonly clips: Readonly<Record<string, readonly Matrix[]>>
  /** 한 프레임을 몇 틱 보여줄 것인가 */
  readonly frameTicks: number
}

export const ENEMY_SPRITES: Readonly<Record<string, EnemySprite>> = {
  ghoul: {
    palette: PAL_GHOUL,
    width: 12,
    height: 22,
    frameTicks: 14,
    clips: {
      spawn: [GHOUL_RISE],
      default: [GHOUL_WALK_A, GHOUL_WALK_B],
    },
  },
  grimm: {
    palette: PAL_GRIMM,
    width: 14,
    height: 16,
    frameTicks: 8,
    clips: {
      dormant: [GRIMM_DORMANT],
      default: [GRIMM_FLY_A, GRIMM_FLY_B],
    },
  },
  corvid: {
    palette: PAL_CORVID,
    width: 12,
    height: 10,
    frameTicks: 6,
    clips: {
      default: [CORVID_UP, CORVID_DOWN],
    },
  },
}

validateAll('ghoul', { walkA: GHOUL_WALK_A, walkB: GHOUL_WALK_B, rise: GHOUL_RISE })
validateAll('grimm', { flyA: GRIMM_FLY_A, flyB: GRIMM_FLY_B, dormant: GRIMM_DORMANT })
validateAll('corvid', { up: CORVID_UP, down: CORVID_DOWN })

/** 상태에 맞는 프레임. 상태별 클립이 없으면 기본 클립을 쓴다. */
export function enemyFrame(sprite: EnemySprite, state: string, tick: number): Matrix {
  const frames = sprite.clips[state] ?? sprite.clips['default'] ?? []
  if (frames.length === 0) throw new Error('프레임이 없는 스프라이트다')
  const index = Math.floor(tick / sprite.frameTicks) % frames.length
  return frames[index] as Matrix
}
