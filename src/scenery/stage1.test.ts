import { describe, expect, it } from 'vitest'
import { createRng } from '../core/rng.ts'
import { scatter } from './props.ts'
import { ridgeline } from './silhouette.ts'
import { FOG, PARALLAX, S1_PALETTE, S1_SCENERY, WISPS } from './stage1.ts'

/** 명도 — 배경과 발판을 가르는 유일한 기준이다. → docs/06 6.2 */
function luma(color: number): number {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('스테이지 1 배경', () => {
  it('패럴랙스 계수가 docs/06 6.2 표와 같다', () => {
    expect(PARALLAX).toEqual({
      sky: 0, far: 0.1, mid: 0.35, near: 0.6, gameplay: 1, foreground: 1.4,
    })
  })

  it('층이 뒤에서 앞으로 정렬돼 있다', () => {
    const factors = S1_SCENERY.map((layer) => layer.parallax)
    const sorted = [...factors].sort((a, b) => a - b)

    expect(factors).toEqual(sorted)
  })

  it('실루엣 층은 전부 발판보다 어둡다 — 발판인지 배경인지 헷갈리면 게임이 실패한다', () => {
    const ground = luma(S1_PALETTE.ground)
    for (const layer of S1_SCENERY) {
      expect(luma(layer.color)).toBeLessThan(ground)
    }
    expect(luma(FOG.color)).toBeLessThan(ground)
  })

  it('하늘이 가장 먼 실루엣보다 밝다 — 등지지 않으면 산맥이 안 보인다', () => {
    // 하늘은 화면 위쪽에만 있어 발판과 맞닿지 않는다. 헷갈릴 일이 없으므로
    // 밝아도 된다. 오히려 밝아야 실루엣이 읽힌다.
    const farthest = luma(S1_SCENERY[0]!.color)
    expect(luma(S1_PALETTE.skyBottom)).toBeGreaterThan(farthest * 1.5)
  })

  it('가까운 층일수록 어둡다 — 겹쳐도 앞뒤가 읽혀야 한다', () => {
    const lumas = S1_SCENERY.map((layer) => luma(layer.color))
    for (let i = 1; i < lumas.length; i += 1) {
      expect(lumas[i]!).toBeLessThan(lumas[i - 1]!)
    }
    // 가장 먼 층도 하늘보다는 어둡다
    expect(lumas[0]!).toBeLessThan(luma(S1_PALETTE.skyBottom))
  })

  it('발판 윗면이 화면에서 가장 밝다 — 밟을 곳의 경계가 한 줄로 보여야 한다', () => {
    const lip = luma(S1_PALETTE.groundLip)
    expect(lip).toBeGreaterThan(luma(S1_PALETTE.ground))
    expect(lip).toBeGreaterThan(luma(S1_PALETTE.skyBottom))
    for (const layer of S1_SCENERY) expect(lip).toBeGreaterThan(luma(layer.color))
  })

  it('앰비언트가 화면을 죽이지 않는다 — 곱하기 층이라 이 값이 곧 전체 밝기다', () => {
    // 0.6 아래로 내리면 밤 분위기가 아니라 안 보이는 화면이 된다.
    expect(luma(S1_PALETTE.ambient) / 255).toBeGreaterThan(0.6)
  })

  it('강조색은 도깨비불에만 쓴다', () => {
    expect(WISPS.color).toBe(S1_PALETTE.wisp)
    expect(S1_SCENERY.some((layer) => layer.color === S1_PALETTE.wisp)).toBe(false)
  })

  it('층마다 반복 폭이 달라야 이음매가 겹치지 않는다', () => {
    const widths = S1_SCENERY.map((layer) =>
      layer.kind === 'ridge' ? layer.ridge.width : layer.scatter.width)

    expect(new Set(widths).size).toBe(widths.length)
  })

  it('모든 층이 실제로 무언가를 만든다', () => {
    for (const layer of S1_SCENERY) {
      if (layer.kind === 'ridge') {
        expect(ridgeline(createRng(layer.seed), layer.ridge).length).toBe(layer.ridge.width)
      } else {
        expect(scatter(createRng(layer.seed), layer.scatter).length).toBeGreaterThan(0)
      }
    }
  })

  it('전경 안개가 랜슬을 덮지 않는다 — 오클루전이지 가림막이 아니다', () => {
    // 랜슬 키는 26px. 안개가 그보다 높으면 서 있는 것만으로 가려진다.
    expect(FOG.height).toBeLessThan(26)
    expect(FOG.alpha).toBeLessThan(1)
  })
})
