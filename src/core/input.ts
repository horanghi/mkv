/**
 * 입력 모델 — 순수. DOM 을 모른다.
 *
 * 매 로직 틱마다 `InputFrame`(비트마스크) 하나를 먹고 새 상태를 돌려준다.
 * 리플레이는 이 비트마스크 배열을 그대로 저장하면 된다.
 *
 * → docs/09-ui-ux-controls.md 9.1
 */

export const ACTIONS = [
  'left',
  'right',
  'up',
  'down',
  'jump',
  'attack',
  'sigil',
  'pause',
  'restart',
] as const

export type Action = (typeof ACTIONS)[number]

/** 한 틱 분량의 입력. 비트 하나가 액션 하나다. */
export type InputFrame = number

const BIT: Readonly<Record<Action, number>> = Object.freeze(
  Object.fromEntries(ACTIONS.map((a, i) => [a, 1 << i])) as Record<Action, number>,
)

/** 버퍼 길이(프레임). docs/09 — 점프 6, 공격 4. */
export const BUFFER_FRAMES = { jump: 6, attack: 4 } as const
export type BufferedAction = keyof typeof BUFFER_FRAMES

export interface InputState {
  readonly held: InputFrame
  /** 이번 틱에 새로 눌린 것 */
  readonly pressed: InputFrame
  /** 이번 틱에 떼어진 것 */
  readonly released: InputFrame
  /** 남은 버퍼 프레임 */
  readonly buffers: Readonly<Record<BufferedAction, number>>
  /** 좌우 동시 입력 해소 결과. -1 왼쪽, 0 정지, 1 오른쪽 */
  readonly moveAxis: -1 | 0 | 1
}

export const INITIAL_INPUT: InputState = Object.freeze({
  held: 0,
  pressed: 0,
  released: 0,
  buffers: Object.freeze({ jump: 0, attack: 0 }),
  moveAxis: 0,
})

export function bitOf(action: Action): number {
  return BIT[action]
}

/** 액션 목록으로 프레임을 만든다. 테스트와 리플레이 작성용. */
export function frameOf(...actions: readonly Action[]): InputFrame {
  return actions.reduce((mask, a) => mask | BIT[a], 0)
}

export function isDown(frame: InputFrame, action: Action): boolean {
  return (frame & BIT[action]) !== 0
}

/**
 * 한 틱 전진.
 *
 * 좌우 동시 입력은 **나중에 누른 쪽**이 이긴다(docs/09). 같은 틱에 둘 다 새로
 * 눌렸다면 오른쪽을 택한다 — 임의의 규칙이지만 결정론을 위해 고정한다.
 */
export function advanceInput(state: InputState, frame: InputFrame): InputState {
  const pressed = frame & ~state.held
  const released = ~frame & state.held & allBits()

  return {
    held: frame,
    pressed,
    released,
    buffers: {
      jump: nextBuffer(state.buffers.jump, pressed, 'jump'),
      attack: nextBuffer(state.buffers.attack, pressed, 'attack'),
    },
    moveAxis: resolveAxis(state.moveAxis, frame, pressed),
  }
}

/** 버퍼를 소비한다. 같은 입력으로 두 번 점프하는 것을 막는다. */
export function consumeBuffer(state: InputState, action: BufferedAction): InputState {
  if (state.buffers[action] === 0) return state
  return { ...state, buffers: { ...state.buffers, [action]: 0 } }
}

export function hasBuffered(state: InputState, action: BufferedAction): boolean {
  return state.buffers[action] > 0
}

function nextBuffer(remaining: number, pressed: InputFrame, action: BufferedAction): number {
  if (isDown(pressed, action)) return BUFFER_FRAMES[action]
  return remaining > 0 ? remaining - 1 : 0
}

function resolveAxis(previous: -1 | 0 | 1, frame: InputFrame, pressed: InputFrame): -1 | 0 | 1 {
  const left = isDown(frame, 'left')
  const right = isDown(frame, 'right')

  if (!left && !right) return 0
  if (left !== right) return left ? -1 : 1

  // 둘 다 눌린 상태 — 이번 틱에 새로 눌린 쪽이 이긴다.
  if (isDown(pressed, 'right')) return 1
  if (isDown(pressed, 'left')) return -1

  // 새 입력이 없으면 직전 판단을 유지한다. 0 이었다면 오른쪽으로 고정한다.
  return previous === 0 ? 1 : previous
}

function allBits(): number {
  return (1 << ACTIONS.length) - 1
}
