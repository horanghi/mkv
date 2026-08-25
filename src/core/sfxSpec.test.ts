import { describe, expect, it } from 'vitest'
import { SFX_SPECS, durationMs, type SfxName } from './sfxSpec.ts'

const NAMES = Object.keys(SFX_SPECS) as SfxName[]

describe('SFX 명세', () => {
  it('모든 소리에 레이어가 있다 — 빈 명세는 무음이다', () => {
    for (const name of NAMES) {
      expect([name, SFX_SPECS[name].layers.length > 0]).toEqual([name, true])
    }
  })

  it('레이어 값이 말이 된다', () => {
    for (const name of NAMES) {
      for (const layer of SFX_SPECS[name].layers) {
        expect([name, layer.ms > 0]).toEqual([name, true])
        expect([name, layer.gain > 0 && layer.gain <= 1]).toEqual([name, true])
        expect([name, layer.delayMs >= 0]).toEqual([name, true])
        // 노이즈가 아니면 들리는 주파수여야 한다
        if (layer.source !== 'noise') {
          expect([name, layer.hz >= 20 && layer.hz <= 20000]).toEqual([name, true])
        }
      }
    }
  })

  it('한 소리의 총 게인이 클리핑 범위를 넘지 않는다', () => {
    for (const name of NAMES) {
      // 같은 시점에 겹치는 레이어의 게인 합만 본다
      const byDelay = new Map<number, number>()
      for (const layer of SFX_SPECS[name].layers) {
        byDelay.set(layer.delayMs, (byDelay.get(layer.delayMs) ?? 0) + layer.gain)
      }
      for (const [delay, sum] of byDelay) {
        expect([name, delay, sum <= 1]).toEqual([name, delay, true])
      }
    }
  })

  it('어떤 소리도 2초를 넘지 않는다 — 다음 사건을 덮는다', () => {
    for (const name of NAMES) {
      expect([name, durationMs(SFX_SPECS[name])]).toEqual([name, durationMs(SFX_SPECS[name])])
      expect([name, durationMs(SFX_SPECS[name]) <= 2000]).toEqual([name, true])
    }
  })

  it('반복 레이어의 길이를 총 길이에 넣는다', () => {
    const spec = { layers: [{ delayMs: 100, hz: 100, ms: 50, source: 'sine' as const, gain: 0.1, repeat: 4, repeatSpreadMs: 100 }] }
    // 100 지연 + 3회 간격 300 + 마지막 50 = 450
    expect(durationMs(spec)).toBe(450)
  })

  it('빈 명세의 길이는 0 이다', () => {
    expect(durationMs({ layers: [] })).toBe(0)
  })
})

describe('갑옷 파괴 — 이 게임의 시그니처 사운드', () => {
  const spec = SFX_SPECS.armorBreak

  it('docs/07 7.5 의 3레이어 구조다 — t=0 파열, t=40ms sub, t=180ms 파편', () => {
    const delays = [...new Set(spec.layers.map((l) => l.delayMs))].sort((a, b) => a - b)
    expect(delays).toEqual([0, 40, 180])
  })

  it('저역 임팩트가 50Hz 대까지 내려간다 — 몸으로 느끼는 부분이다', () => {
    const sub = spec.layers.find((l) => l.delayMs === 40)
    expect(sub).toBeDefined()
    expect(sub!.toHz ?? sub!.hz).toBeLessThanOrEqual(60)
    // 가장 센 레이어여야 한다
    expect(sub!.gain).toBe(Math.max(...spec.layers.map((l) => l.gain)))
  })

  it('금속 파열은 좁은 밴드패스가 걸린 고역 노이즈다', () => {
    const metal = spec.layers.find((l) => l.delayMs === 0 && l.source === 'noise')
    expect(metal).toBeDefined()
    expect(metal!.filterHz).toBeGreaterThan(2000)
    expect(metal!.q).toBeGreaterThan(1)
  })

  it('파편은 여러 조각이 시차를 두고 떨어진다', () => {
    const shards = spec.layers.find((l) => l.delayMs === 180)
    expect(shards!.repeat).toBeGreaterThan(3)
    expect(shards!.repeatSpreadMs).toBeGreaterThan(0)
  })

  it('연출 타임라인 안에서 끝난다 — 소리가 그림보다 늦으면 안 맞는다', () => {
    // ARMOR_BREAK 타임라인은 180ms 에 재개까지 간다. 소리의 꼬리는 조금 더 남아도 되지만
    // 1.5초를 넘으면 다음 피격을 덮는다.
    expect(durationMs(spec)).toBeLessThan(1500)
  })
})

describe('사망 — 일부러 코믹하게', () => {
  const spec = SFX_SPECS.death

  it('잔혹하지 않게: 저역 폭발이 없다', () => {
    // 40Hz 대의 강한 sub 는 "무겁고 잔혹한" 소리를 만든다. 반복 사망에 견딜 수 없어진다.
    const heavySub = spec.layers.some((l) => (l.toHz ?? l.hz) < 70 && l.gain > 0.3)
    expect(heavySub).toBe(false)
  })

  it('미끄러지는 음정이 있다 — 만화적인 낙하', () => {
    const slide = spec.layers.find((l) => l.toHz !== undefined)
    expect(slide).toBeDefined()
    expect(slide!.toHz!).toBeLessThan(slide!.hz)
  })

  it('뼈 소리가 딱딱 반복된다', () => {
    expect(spec.layers.some((l) => (l.repeat ?? 1) > 1)).toBe(true)
  })
})

describe('그림 이륙 — 고유하고 날카롭게', () => {
  const spec = SFX_SPECS.grimmTakeoff

  it('올라가는 음정이다 — 다른 어떤 소리와도 겹치지 않는다', () => {
    const rising = spec.layers.filter((l) => l.toHz !== undefined && l.toHz > l.hz)
    expect(rising.length).toBeGreaterThan(0)
  })

  it('다른 소리 중에 올라가면서 고역까지 가는 것이 없다', () => {
    // 이 소리만의 특징이어야 조건반사가 생긴다.
    const others = NAMES.filter((n) => n !== 'grimmTakeoff' && n !== 'relic' && n !== 'jump')
    for (const name of others) {
      const risesHigh = SFX_SPECS[name].layers.some(
        (l) => l.toHz !== undefined && l.toHz > l.hz && l.toHz > 1400)
      expect([name, risesHigh]).toEqual([name, false])
    }
  })
})
