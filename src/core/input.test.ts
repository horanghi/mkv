import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  BUFFER_FRAMES,
  INITIAL_INPUT,
  advanceInput,
  consumeBuffer,
  frameOf,
  hasBuffered,
  isDown,
  type InputState,
} from './input.ts'

function feed(frames: readonly number[], from: InputState = INITIAL_INPUT): InputState {
  return frames.reduce((s, f) => advanceInput(s, f), from)
}

describe('비트마스크', () => {
  it('액션마다 서로 다른 비트를 쓴다', () => {
    const bits = ACTIONS.map((a) => frameOf(a))
    expect(new Set(bits).size).toBe(ACTIONS.length)
  })

  it('여러 액션을 합칠 수 있다', () => {
    const frame = frameOf('left', 'jump')
    expect(isDown(frame, 'left')).toBe(true)
    expect(isDown(frame, 'jump')).toBe(true)
    expect(isDown(frame, 'right')).toBe(false)
  })
})

describe('눌림 · 떼어짐', () => {
  it('새로 눌린 것만 pressed 에 들어간다', () => {
    const first = advanceInput(INITIAL_INPUT, frameOf('jump'))
    expect(isDown(first.pressed, 'jump')).toBe(true)

    const held = advanceInput(first, frameOf('jump'))
    expect(isDown(held.pressed, 'jump')).toBe(false)
    expect(isDown(held.held, 'jump')).toBe(true)
  })

  it('떼면 released 에 들어간다', () => {
    const down = advanceInput(INITIAL_INPUT, frameOf('attack'))
    const up = advanceInput(down, 0)
    expect(isDown(up.released, 'attack')).toBe(true)
    expect(isDown(up.held, 'attack')).toBe(false)
  })
})

describe('버퍼', () => {
  it('점프 버퍼는 6프레임이다 — docs/09', () => {
    expect(BUFFER_FRAMES.jump).toBe(6)
    expect(BUFFER_FRAMES.attack).toBe(4)
  })

  it('누른 뒤 버퍼 프레임 동안 유효하다', () => {
    let state = advanceInput(INITIAL_INPUT, frameOf('jump'))
    expect(state.buffers.jump).toBe(6)

    for (let i = 5; i >= 0; i -= 1) {
      state = advanceInput(state, 0)
      expect(state.buffers.jump).toBe(i)
    }
    expect(hasBuffered(state, 'jump')).toBe(false)
  })

  it('버퍼가 만료되기 전까지는 착지 점프가 성립한다', () => {
    // 착지 3프레임 전에 누른 점프
    const state = feed([frameOf('jump'), 0, 0, 0])
    expect(hasBuffered(state, 'jump')).toBe(true)
  })

  it('소비하면 즉시 0 이 된다 — 같은 입력으로 두 번 점프하지 않는다', () => {
    const pressed = advanceInput(INITIAL_INPUT, frameOf('jump'))
    const consumed = consumeBuffer(pressed, 'jump')
    expect(consumed.buffers.jump).toBe(0)
    expect(hasBuffered(consumed, 'jump')).toBe(false)
  })

  it('빈 버퍼를 소비하면 같은 객체를 돌려준다', () => {
    expect(consumeBuffer(INITIAL_INPUT, 'jump')).toBe(INITIAL_INPUT)
  })

  it('누르고 있어도 버퍼는 갱신되지 않는다', () => {
    const state = feed([frameOf('jump'), frameOf('jump'), frameOf('jump')])
    expect(state.buffers.jump).toBe(4)
  })
})

describe('좌우 동시 입력 — 나중에 누른 쪽 우선', () => {
  it('한쪽만 누르면 그쪽이다', () => {
    expect(advanceInput(INITIAL_INPUT, frameOf('left')).moveAxis).toBe(-1)
    expect(advanceInput(INITIAL_INPUT, frameOf('right')).moveAxis).toBe(1)
  })

  it('아무것도 안 누르면 0 이다', () => {
    expect(feed([frameOf('left'), 0]).moveAxis).toBe(0)
  })

  it('왼쪽을 누른 채 오른쪽을 추가로 누르면 오른쪽이 이긴다', () => {
    const state = feed([frameOf('left'), frameOf('left', 'right')])
    expect(state.moveAxis).toBe(1)
  })

  it('오른쪽을 누른 채 왼쪽을 추가로 누르면 왼쪽이 이긴다', () => {
    const state = feed([frameOf('right'), frameOf('right', 'left')])
    expect(state.moveAxis).toBe(-1)
  })

  it('나중에 누른 쪽을 떼면 남은 쪽으로 돌아간다', () => {
    const state = feed([frameOf('left'), frameOf('left', 'right'), frameOf('left')])
    expect(state.moveAxis).toBe(-1)
  })

  it('둘 다 계속 누르고 있으면 판단이 흔들리지 않는다', () => {
    const both = frameOf('left', 'right')
    const state = feed([frameOf('left'), both, both, both, both])
    expect(state.moveAxis).toBe(1)
  })

  it('같은 틱에 둘 다 눌리면 오른쪽으로 고정한다 — 결정론', () => {
    expect(advanceInput(INITIAL_INPUT, frameOf('left', 'right')).moveAxis).toBe(1)
  })
})

describe('불변성', () => {
  it('원본을 바꾸지 않는다', () => {
    const before = JSON.stringify(INITIAL_INPUT)
    advanceInput(INITIAL_INPUT, frameOf('jump', 'left'))
    expect(JSON.stringify(INITIAL_INPUT)).toBe(before)
  })
})
