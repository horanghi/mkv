import type { Balance } from '../data/load.ts'
import type { Stage } from './stage.ts'

/**
 * 난이도 3단계.
 *
 * **난이도를 낮추는 것이 아니라 "관용"을 조절한다.** → docs/08 8.4
 * 적 HP·데미지를 건드리지 않고, 체크포인트·제한 시간·잔기·적 밀도만 바꾼다.
 * "쉬운 모드로 클리어해도 같은 게임을 했다"는 감각이 유지되어야 하고,
 * 모드 간 격차는 실력이 아니라 **인내심의 차이**로 설계한다.
 *
 * 원코인(참회)은 여기 없다. 그건 난이도 축이 아니라 **도전 모디파이어**이고,
 * 세 단계 어디에나 얹을 수 있다. → docs/08 8.4
 */

export const DIFFICULTIES = ['squire', 'knight', 'paladin'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** 기본값. 처음 오는 사람은 여기서 시작한다. */
export const DEFAULT_DIFFICULTY: Difficulty = 'knight'

export interface DifficultyRules {
  readonly id: Difficulty
  readonly name: string
  readonly forWhom: string
  /** 시작 잔기 */
  readonly lives: number
  readonly stageTimeSeconds: number
  /** 스테이지가 제공하는 체크포인트 중 몇 개를 쓸 것인가 */
  readonly checkpoints: number
  /** 적 배치 밀도 배율. 1 이 원래 배치 */
  readonly enemyDensity: number
  /** 그림 출현 배율. 시리즈 전통의 트라우마라 따로 조절한다 */
  readonly grimmRate: number
  /** 노히트 보너스 배율 */
  readonly noHitMultiplier: number
  /** 컨티뉴가 있는가 */
  readonly continues: boolean
}

export const DIFFICULTY_RULES: Readonly<Record<Difficulty, DifficultyRules>> = {
  squire: {
    id: 'squire',
    name: '종자',
    forWhom: '입문자',
    lives: 5,
    stageTimeSeconds: 480,
    checkpoints: 3,
    enemyDensity: 1,
    grimmRate: 0.7,
    noHitMultiplier: 1,
    continues: true,
  },
  knight: {
    id: 'knight',
    name: '기사',
    forWhom: '기본',
    lives: 3,
    stageTimeSeconds: 300,
    checkpoints: 2,
    enemyDensity: 1,
    grimmRate: 1,
    noHitMultiplier: 1,
    continues: true,
  },
  paladin: {
    id: 'paladin',
    name: '성기사',
    forWhom: '숙련자',
    lives: 2,
    stageTimeSeconds: 240,
    checkpoints: 1,
    enemyDensity: 1.25,
    grimmRate: 1,
    noHitMultiplier: 2,
    continues: true,
  },
}

export function rulesFor(difficulty: Difficulty): DifficultyRules {
  return DIFFICULTY_RULES[difficulty]
}

/** 모르는 값은 기본으로 떨어뜨린다. 저장된 설정이 낡았을 수 있다. */
export function parseDifficulty(value: unknown): Difficulty {
  return DIFFICULTIES.includes(value as Difficulty) ? (value as Difficulty) : DEFAULT_DIFFICULTY
}

/**
 * 밸런스에 난이도를 얹는다.
 *
 * **잔기와 시간만 바꾼다.** 이동·점프·중력은 손대지 않는다 —
 * 고정 점프 궤도는 비협상 원칙이고, 난이도로 흔들면 같은 게임이 아니게 된다.
 */
export function applyDifficulty(balance: Balance, difficulty: Difficulty): Balance {
  const rules = rulesFor(difficulty)
  return {
    ...balance,
    player: {
      ...balance.player,
      startingLives: rules.lives,
      stageTimeLimitSeconds: rules.stageTimeSeconds,
    },
  }
}

/**
 * 난이도에 맞춘 스테이지.
 *
 * 체크포인트는 **뒤에서부터 버린다** — 남기는 것은 앞쪽이다. 마지막 체크포인트만
 * 남기면 성기사에서 스테이지 초반이 통째로 무체크포인트가 되어, 관용이 아니라
 * 형벌이 된다. → docs/04 원칙 4 "15초 규칙"
 *
 * 적 밀도는 배율만큼 **되풀이해 끼워 넣는다.** 새 좌표를 지어내지 않는다 —
 * 레벨 배치 규칙(착지 지점, 궤도 위)을 지키는 좌표는 이미 검증된 것뿐이다.
 */
export function applyDifficultyToStage(stage: Stage, difficulty: Difficulty): Stage {
  const rules = rulesFor(difficulty)

  const checkpoints = stage.checkpoints.slice(0, Math.max(0, rules.checkpoints))

  const grimms = stage.enemies.filter((e) => e.kind === 'grimm')
  const keptGrimms = Math.round(grimms.length * rules.grimmRate)
  let seenGrimm = 0
  const thinned = stage.enemies.filter((enemy) => {
    if (enemy.kind !== 'grimm') return true
    seenGrimm += 1
    return seenGrimm <= keptGrimms
  })

  return { ...stage, checkpoints, enemies: densify(thinned, rules.enemyDensity) }
}

/**
 * 밀도 배율만큼 적을 늘린다.
 *
 * 이미 있는 배치를 앞에서부터 복제해 **바로 옆(2타일 뒤)** 에 세운다.
 * 검증된 좌표 근처만 쓰는 이유는, 임의 좌표가 착지 지점·궤도 규칙을
 * 깨뜨릴 수 있기 때문이다.
 */
function densify(
  enemies: Stage['enemies'],
  density: number,
): Stage['enemies'] {
  if (density <= 1) return enemies

  const extra = Math.round(enemies.length * (density - 1))
  const added = enemies.slice(0, extra).map((enemy) => ({ ...enemy, tx: enemy.tx + 2 }))
  return [...enemies, ...added]
}
