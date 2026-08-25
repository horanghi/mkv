import { describe, expect, it } from 'vitest'
import { TICK_MS } from './config.ts'
import {
  REALTIME, SLOW_SCALES,
  consume, cycleScale, labelOf, requestStep, toggleStepping,
} from './timeControl.ts'

describe('시간 제어', () => {
  it('기본은 실시간이고 아무 표시도 없다', () => {
    expect(consume(REALTIME, 16).frameMs).toBe(16)
    expect(labelOf(REALTIME)).toBeNull()
  })

  it('배율이 순환한다 — docs/10 10.10 의 0.1x~1.0x', () => {
    let c = REALTIME
    const seen: number[] = []
    for (let i = 0; i < SLOW_SCALES.length; i += 1) {
      c = cycleScale(c)
      seen.push(c.scale)
    }
    expect(seen).toEqual([...SLOW_SCALES.slice(1), SLOW_SCALES[0]])
  })

  it('배율만큼 시간이 느려진다', () => {
    const slow = { ...REALTIME, scale: 0.25 }
    expect(consume(slow, 16).frameMs).toBe(4)
    expect(labelOf(slow)).toContain('0.25')
  })

  it('프레임 스텝은 요청이 있을 때만 한 틱 준다', () => {
    let c = toggleStepping(REALTIME)
    expect(c.stepping).toBe(true)

    // 요청이 없으면 시간이 흐르지 않는다
    expect(consume(c, 16).frameMs).toBe(0)

    c = requestStep(c)
    const slice = consume(c, 16)
    expect(slice.frameMs).toBe(TICK_MS)
    // 한 번 쓰면 사라진다
    expect(consume(slice.control, 16).frameMs).toBe(0)
  })

  it('실제 프레임 간격이 아니라 정확히 한 틱을 준다 — 한 번 눌렀는데 여러 틱이 가면 안 된다', () => {
    const c = requestStep(toggleStepping(REALTIME))
    expect(consume(c, 500).frameMs).toBe(TICK_MS)
  })

  it('스텝 모드가 아니면 요청을 무시한다', () => {
    expect(requestStep(REALTIME)).toBe(REALTIME)
  })

  it('스텝 요청은 쌓인다', () => {
    let c = toggleStepping(REALTIME)
    c = requestStep(requestStep(c))
    expect(c.pending).toBe(2)

    let slice = consume(c, 16)
    expect(slice.frameMs).toBe(TICK_MS)
    slice = consume(slice.control, 16)
    expect(slice.frameMs).toBe(TICK_MS)
    expect(consume(slice.control, 16).frameMs).toBe(0)
  })

  it('스텝 모드를 끄면 밀린 요청을 버린다 — 재개할 때 쏟아지면 안 된다', () => {
    let c = requestStep(requestStep(toggleStepping(REALTIME)))
    c = toggleStepping(c)
    expect(c.stepping).toBe(false)
    expect(c.pending).toBe(0)
    expect(consume(c, 16).frameMs).toBe(16)
  })

  it('스텝 모드는 배율과 무관하다', () => {
    const c = requestStep(toggleStepping({ ...REALTIME, scale: 0.1 }))
    expect(consume(c, 16).frameMs).toBe(TICK_MS)
    expect(labelOf(c)).toContain('FRAME STEP')
  })

  it('말이 안 되는 프레임 간격을 견딘다', () => {
    expect(consume(REALTIME, -5).frameMs).toBe(0)
    expect(consume(REALTIME, Number.NaN).frameMs).toBe(0)
  })

  it('원본을 바꾸지 않는다', () => {
    const before = toggleStepping(REALTIME)
    requestStep(before)
    cycleScale(before)
    expect(before.pending).toBe(0)
    expect(before.scale).toBe(1)
  })
})
