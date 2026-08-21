import { describe, expect, it } from 'vitest'
import { MAX_CATCHUP_TICKS, TICK_MS } from './config.ts'
import { INITIAL_LOOP, advance, clearHitstop, requestHitstop, type LoopState } from './loop.ts'

function run(state: LoopState, frames: readonly number[]): LoopState {
  return frames.reduce((s, ms) => advance(s, ms).state, state)
}

describe('고정 타임스텝', () => {
  it('한 틱보다 짧은 프레임은 틱을 돌리지 않는다', () => {
    const r = advance(INITIAL_LOOP, 8)
    expect(r.ticks).toBe(0)
    expect(r.state.tick).toBe(0)
    expect(r.alpha).toBeCloseTo(8 / TICK_MS)
  })

  it('누산기가 넘치면 틱이 나온다', () => {
    const first = advance(INITIAL_LOOP, 10)
    expect(first.ticks).toBe(0)
    const second = advance(first.state, 10)
    expect(second.ticks).toBe(1)
    expect(second.state.tick).toBe(1)
  })

  it('60fps 로 1초를 돌리면 정확히 60틱이다', () => {
    const state = run(INITIAL_LOOP, Array.from({ length: 60 }, () => TICK_MS))
    expect(state.tick).toBe(60)
  })

  it('불규칙한 프레임에서도 시간당 틱 수가 유지된다', () => {
    // 총 1000ms 를 들쭉날쭉하게 흘려도 60틱 근처여야 한다.
    const frames = [8, 33, 12, 16, 50, 16, 16, 9, 24, 16, 16, 16, 16, 16, 16]
    const total = frames.reduce((a, b) => a + b, 0)
    const state = run(INITIAL_LOOP, frames)
    expect(state.tick).toBe(Math.floor(total / TICK_MS))
  })

  it('음수 · NaN 프레임을 무시한다', () => {
    expect(advance(INITIAL_LOOP, -100).ticks).toBe(0)
    expect(advance(INITIAL_LOOP, Number.NaN).state.accumulatorMs).toBe(0)
  })

  it('alpha 는 항상 [0, 1) 이다', () => {
    let state = INITIAL_LOOP
    for (const ms of [3, 17, 41, 99, 5, 250]) {
      const r = advance(state, ms)
      expect(r.alpha).toBeGreaterThanOrEqual(0)
      expect(r.alpha).toBeLessThan(1)
      state = r.state
    }
  })
})

describe('캐치업 상한 — 죽음의 나선 방지', () => {
  it('한 프레임에 상한 이상 돌지 않는다', () => {
    const r = advance(INITIAL_LOOP, TICK_MS * 20)
    expect(r.ticks).toBe(MAX_CATCHUP_TICKS)
    expect(r.droppedTicks).toBe(20 - MAX_CATCHUP_TICKS)
  })

  it('버린 틱의 시간도 함께 버린다', () => {
    // 남겨두면 다음 프레임에도 또 상한에 걸려 영영 따라잡지 못한다.
    const r = advance(INITIAL_LOOP, TICK_MS * 20)
    expect(r.state.accumulatorMs).toBeLessThan(TICK_MS)

    const next = advance(r.state, TICK_MS)
    expect(next.droppedTicks).toBe(0)
  })

  it('탭 전환 후 긴 공백에서도 한 프레임 안에 복구된다', () => {
    const r = advance(INITIAL_LOOP, 60_000)
    expect(r.ticks).toBe(MAX_CATCHUP_TICKS)
    expect(advance(r.state, TICK_MS).droppedTicks).toBe(0)
  })
})

describe('히트스톱', () => {
  it('로직 틱만 멈춘다', () => {
    const stopped = requestHitstop(INITIAL_LOOP, 180)
    const r = advance(stopped, TICK_MS)

    expect(r.hitstopped).toBe(true)
    expect(r.ticks).toBe(0)
    expect(r.state.tick).toBe(0)
    expect(r.state.hitstopMs).toBeCloseTo(180 - TICK_MS)
  })

  it('히트스톱 중 시간이 누산기에 쌓이지 않는다', () => {
    // 쌓였다면 해제 직후 밀린 틱이 한꺼번에 터져 연출이 날아간다.
    let state = requestHitstop(INITIAL_LOOP, 180)
    for (let i = 0; i < 11; i += 1) state = advance(state, TICK_MS).state

    expect(state.tick).toBe(0)
    expect(state.hitstopMs).toBe(0)
    expect(advance(state, TICK_MS).ticks).toBe(1)
  })

  it('히트스톱이 끝나는 프레임의 잔여 시간은 로직으로 넘어간다', () => {
    const stopped = requestHitstop(INITIAL_LOOP, 4)
    const r = advance(stopped, TICK_MS + 4)
    expect(r.state.hitstopMs).toBe(0)
    expect(r.ticks).toBe(1)
  })

  it('겹쳐 걸면 긴 쪽이 이긴다', () => {
    const long = requestHitstop(INITIAL_LOOP, 180)
    expect(requestHitstop(long, 60).hitstopMs).toBe(180)
    expect(requestHitstop(long, 400).hitstopMs).toBe(400)
  })

  it('음수 · NaN 요청을 무시한다', () => {
    expect(requestHitstop(INITIAL_LOOP, -50).hitstopMs).toBe(0)
    expect(requestHitstop(INITIAL_LOOP, Number.NaN).hitstopMs).toBe(0)
  })

  it('즉시 해제할 수 있다', () => {
    expect(clearHitstop(requestHitstop(INITIAL_LOOP, 400)).hitstopMs).toBe(0)
  })
})

describe('불변성', () => {
  it('원본 상태를 바꾸지 않는다', () => {
    const before = { ...INITIAL_LOOP }
    advance(INITIAL_LOOP, 100)
    requestHitstop(INITIAL_LOOP, 100)
    expect(INITIAL_LOOP).toEqual(before)
  })
})
