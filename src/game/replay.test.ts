import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../core/config.ts'
import { frameOf, type InputFrame } from '../core/input.ts'
import { createRng, nextFloat } from '../core/rng.ts'
import { loadBalance } from '../data/load.ts'
import {
  decodeReplay,
  encodeReplay,
  hashState,
  runReplay,
  type Replay,
  type ReplayStep,
} from './replay.ts'

const player = loadBalance().player

/**
 * 실제 플레이어 물리가 들어오기 전(m0-4)까지 결정론을 지키는 대역이다.
 * 고정 dt 적분 + 시드 난수 — 검증하려는 성질은 동일하다.
 */
interface ToyState {
  readonly x: number
  readonly vx: number
  readonly rng: number
  readonly rolls: number
}

const INITIAL: ToyState = { x: 0, vx: 0, rng: createRng(20260821), rolls: 0 }

const step: ReplayStep<ToyState> = (state, input) => {
  const target = input.moveAxis * player.runSpeed
  const rate = target === 0 ? player.decel : player.accel
  const delta = target - state.vx
  const change = Math.sign(delta) * Math.min(Math.abs(delta), rate * TICK_SECONDS)

  const draw = nextFloat(state.rng)

  return {
    x: state.x + (state.vx + change) * TICK_SECONDS,
    vx: state.vx + change,
    rng: draw.state,
    rolls: state.rolls + (draw.value > 0.5 ? 1 : 0),
  }
}

/** 오른쪽 60틱 → 정지 20틱 → 왼쪽 40틱. */
const RECORDED: readonly InputFrame[] = [
  ...Array.from({ length: 60 }, () => frameOf('right')),
  ...Array.from({ length: 20 }, () => 0),
  ...Array.from({ length: 40 }, () => frameOf('left')),
]

const REPLAY: Replay = { seed: 20260821, frames: RECORDED }

describe('골든 리플레이', () => {
  it('같은 입력은 항상 같은 최종 상태를 만든다', () => {
    const a = runReplay(INITIAL, step, REPLAY)
    const b = runReplay(INITIAL, step, REPLAY)
    expect(hashState(a.state)).toBe(hashState(b.state))
    expect(a.state).toEqual(b.state)
  })

  it('결과가 물리적으로 말이 된다', () => {
    const { state } = runReplay(INITIAL, step, REPLAY)
    // 오른쪽으로 1초간 달렸으므로 최대 속도에 도달했어야 한다.
    expect(Math.abs(state.vx)).toBeLessThanOrEqual(player.runSpeed)
    // 오른쪽 60틱이 왼쪽 40틱보다 길다 — 출발점보다 오른쪽에 있어야 한다.
    expect(state.x).toBeGreaterThan(0)
    expect(state.vx).toBeLessThan(0)
  })

  it('입력 하나만 바뀌어도 최종 상태가 달라진다', () => {
    const tampered: Replay = {
      ...REPLAY,
      frames: RECORDED.map((f, i) => (i === 30 ? 0 : f)),
    }
    expect(hashState(runReplay(INITIAL, step, tampered).state)).not.toBe(
      hashState(runReplay(INITIAL, step, REPLAY).state),
    )
  })

  it('회귀 잠금 — 이 해시가 바뀌면 물리가 바뀐 것이다', () => {
    // 의도한 변경이라면 이 값을 갱신한다. 의도하지 않았다면 버그다.
    expect(hashState(runReplay(INITIAL, step, REPLAY).state)).toBe(1_349_596_698)
  })

  it('빈 리플레이는 초기 상태 그대로다', () => {
    const result = runReplay(INITIAL, step, { seed: 1, frames: [] })
    expect(result.state).toEqual(INITIAL)
    expect(result.ticks).toBe(0)
  })
})

describe('hashState', () => {
  it('키 순서에 영향받지 않는다', () => {
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }))
  })

  it('값이 다르면 해시도 다르다', () => {
    expect(hashState({ x: 1 })).not.toBe(hashState({ x: 1.0000001 }))
  })

  it('undefined 를 다룬다', () => {
    expect(hashState(undefined)).toBe(hashState(undefined))
    expect(hashState({ a: undefined })).not.toBe(hashState({ a: null }))
  })

  it('중첩 구조와 배열을 다룬다', () => {
    expect(hashState({ a: [1, { b: null }] })).toBe(hashState({ a: [1, { b: null }] }))
    expect(hashState([1, 2])).not.toBe(hashState([2, 1]))
  })
})

describe('리플레이 직렬화', () => {
  it('왕복해도 같다', () => {
    const text = encodeReplay(REPLAY)
    expect(decodeReplay(text)).toEqual(REPLAY)
  })

  it('빈 리플레이도 왕복한다', () => {
    const empty: Replay = { seed: 7, frames: [] }
    expect(decodeReplay(encodeReplay(empty))).toEqual(empty)
  })

  it('망가진 문자열을 거부한다', () => {
    expect(() => decodeReplay('no-separator')).toThrow(/형식/)
    expect(() => decodeReplay('zz:1,??,3')).toThrow(/입력 프레임/)
    expect(() => decodeReplay('??:1')).toThrow(/시드/)
  })
})
