import { describe, expect, it } from 'vitest'
import { STEMS } from './audio.ts'
import {
  BARS, BASE_BPM, STEPS_PER_BAR, TOTAL_STEPS,
  loopNotes, notesAt, stepSeconds,
} from './bgmPattern.ts'

describe('S1 왈츠 패턴', () => {
  it('docs/07 7.3 의 박자와 템포다 — 3/4 · 96BPM', () => {
    expect(STEPS_PER_BAR).toBe(6)          // 3박 × 8분음표 2
    expect(BASE_BPM).toBe(96)
    expect(TOTAL_STEPS).toBe(STEPS_PER_BAR * BARS)
  })

  it('스텝 길이가 템포를 따른다', () => {
    expect(stepSeconds(1)).toBeCloseTo(60 / 96 / 2, 6)
    // 잔여 30초의 +12% 는 스텝을 짧게 만든다
    expect(stepSeconds(1.12)).toBeLessThan(stepSeconds(1))
  })

  it('말이 안 되는 템포에도 0 으로 나누지 않는다', () => {
    expect(Number.isFinite(stepSeconds(0))).toBe(true)
    expect(stepSeconds(0)).toBeGreaterThan(0)
  })

  it('모든 스템이 한 바퀴에 무언가를 낸다 — 비어 있으면 믹스가 무의미하다', () => {
    for (const stem of STEMS) {
      expect([stem, loopNotes(stem).length > 0]).toEqual([stem, true])
    }
  })

  it('베이스는 마디 1박에만 온다 — 왈츠의 무게중심이다', () => {
    for (let bar = 0; bar < BARS; bar += 1) {
      const base = bar * STEPS_PER_BAR
      expect([bar, notesAt('bass', base).length]).toEqual([bar, 1])
      for (let beat = 1; beat < STEPS_PER_BAR; beat += 1) {
        expect([bar, beat, notesAt('bass', base + beat).length]).toEqual([bar, beat, 0])
      }
    }
  })

  it('리듬은 2·3박에 화음을 얹는다 — 이게 왈츠를 왈츠로 만든다', () => {
    expect(notesAt('rhythm', 0)).toEqual([])
    expect(notesAt('rhythm', 2).length).toBe(3)
    expect(notesAt('rhythm', 4).length).toBe(3)
    // 2박이 3박보다 세다
    expect(notesAt('rhythm', 2)[0]!.gain).toBeGreaterThan(notesAt('rhythm', 4)[0]!.gain)
  })

  it('선율에 쉼이 있다 — 8분음표를 다 채우면 회전하지 않는다', () => {
    let rests = 0
    for (let step = 0; step < TOTAL_STEPS; step += 1) {
      if (notesAt('melody', step).length === 0) rests += 1
    }
    expect(rests).toBeGreaterThan(TOTAL_STEPS / 2)
  })

  it('코러스는 마디 첫 박에 길게 깔린다', () => {
    const first = notesAt('chorus', 0)
    expect(first.length).toBe(2)
    expect(first[0]!.steps).toBe(STEPS_PER_BAR)
    expect(notesAt('chorus', 1)).toEqual([])
  })

  it('종소리는 4마디마다 한 번이다', () => {
    expect(notesAt('percussion', 0).length).toBe(1)
    expect(notesAt('percussion', 4 * STEPS_PER_BAR).length).toBe(1)
    expect(notesAt('percussion', STEPS_PER_BAR)).toEqual([])
    expect(loopNotes('percussion').length).toBe(2)
  })

  it('한 바퀴 뒤에 같은 것이 나온다 — 이음매가 없어야 한다', () => {
    for (const stem of STEMS) {
      for (let step = 0; step < TOTAL_STEPS; step += 3) {
        expect([stem, step, notesAt(stem, step)])
          .toEqual([stem, step, notesAt(stem, step + TOTAL_STEPS)])
      }
    }
  })

  it('음수 스텝도 접힌다', () => {
    expect(notesAt('bass', -TOTAL_STEPS)).toEqual(notesAt('bass', 0))
  })

  it('모든 음이 들리는 주파수 범위 안이다', () => {
    for (const stem of STEMS) {
      for (const note of loopNotes(stem)) {
        expect([stem, note.hz > 40 && note.hz < 4000]).toEqual([stem, true])
        expect([stem, note.steps > 0]).toEqual([stem, true])
      }
    }
  })
})
