import { describe, expect, it } from 'vitest'
import {
  COUNTDOWN_MS, RUNNING,
  countdownNumber, isMenuOpen, isPlayable, pause, resume, step, toggle,
} from './pause.ts'

describe('일시정지', () => {
  it('멈추면 로직이 서고 메뉴가 열린다', () => {
    const paused = pause(RUNNING)
    expect(paused.phase).toBe('paused')
    expect(isPlayable(paused)).toBe(false)
    expect(isMenuOpen(paused)).toBe(true)
  })

  it('두 번 멈춰도 같은 상태다', () => {
    const once = pause(RUNNING)
    expect(pause(once)).toBe(once)
  })

  it('재개는 바로 풀리지 않는다 — 손을 올리기 전에 맞으면 안 된다', () => {
    const resuming = resume(pause(RUNNING))
    expect(resuming.phase).toBe('resuming')
    expect(isPlayable(resuming)).toBe(false)
    expect(isMenuOpen(resuming)).toBe(false)
    expect(resuming.countdownMs).toBe(COUNTDOWN_MS)
  })

  it('3-2-1 을 센다', () => {
    let s = resume(pause(RUNNING))
    expect(countdownNumber(s)).toBe(3)
    s = step(s, 1000)
    expect(countdownNumber(s)).toBe(2)
    s = step(s, 1000)
    expect(countdownNumber(s)).toBe(1)
    s = step(s, 999)
    expect(countdownNumber(s)).toBe(1)
    s = step(s, 1)
    expect(s).toBe(RUNNING)
    expect(isPlayable(s)).toBe(true)
  })

  it('카운트다운이 끝나면 정확히 RUNNING 이다', () => {
    expect(step(resume(pause(RUNNING)), COUNTDOWN_MS)).toBe(RUNNING)
    expect(step(resume(pause(RUNNING)), 99999)).toBe(RUNNING)
  })

  it('카운트다운 중에 다시 누르면 도로 멈춘다', () => {
    const resuming = resume(pause(RUNNING))
    expect(toggle(resuming).phase).toBe('resuming')
    expect(toggle(pause(RUNNING)).phase).toBe('resuming')
    expect(toggle(RUNNING).phase).toBe('paused')
  })

  it('멈춰 있는 동안에는 시간이 흘러도 아무 일이 없다', () => {
    const paused = pause(RUNNING)
    expect(step(paused, 5000)).toBe(paused)
    expect(step(RUNNING, 5000)).toBe(RUNNING)
  })

  it('음수 dt 에 카운트다운이 거꾸로 가지 않는다', () => {
    const resuming = resume(pause(RUNNING))
    expect(step(resuming, -1000).countdownMs).toBe(COUNTDOWN_MS)
  })

  it('달리는 중에는 카운트다운 숫자가 없다', () => {
    expect(countdownNumber(RUNNING)).toBeNull()
    expect(countdownNumber(pause(RUNNING))).toBeNull()
  })
})
