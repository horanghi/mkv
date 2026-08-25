import type { Matrix } from './matrix.ts'

/**
 * 팔레트 — 색 인덱스에서 실제 색으로.
 *
 * 갑옷 두 종은 **같은 매트릭스에 팔레트만 교체**한다.
 * 성유물과 강철이 같은 도트를 쓰는 것이 여기서 성립한다.
 * → docs/12-sprites.md 12.2
 */

export type Palette = Readonly<Record<string, string>>

export const PAL_RELIC: Palette = {
  '0': '#0B0710', '1': '#FFF6D0', '2': '#F0C04A', '3': '#C4901E', '4': '#8A5F14',
  B: '#2A1D08', '7': '#E8546A', '8': '#9B2436',
}

export const PAL_STEEL: Palette = {
  '0': '#0B0710', '1': '#EDF2FA', '2': '#B9C6D8', '3': '#8695AC', '4': '#5F6E85',
  B: '#2A2438', '7': '#C23B4A', '8': '#7E1F2C',
}

export const PAL_FLESH: Palette = {
  '0': '#0B0710', '5': '#F0C08A', '6': '#C08A5E', '9': '#EDE6D8', A: '#B9AE9A',
  C: '#3E2E1E', D: '#5E4630',
}

export const PAL_BONE: Palette = {
  '0': '#0B0710', '9': '#EDE6D8', A: '#A99C8A', B: '#241C2E',
}

/** `#RRGGBB` 를 0xRRGGBB 정수로. PixiJS 가 정수 색을 받는다. */
export function toHexNumber(color: string): number {
  return Number.parseInt(color.slice(1), 16)
}

/** 픽셀 하나의 색. 팔레트에 없는 인덱스는 undefined — 그리지 않는다. */
export function colorAt(palette: Palette, ch: string): string | undefined {
  return palette[ch]
}

/**
 * 매트릭스가 쓰는 인덱스가 팔레트에 전부 있는지 확인한다.
 *
 * 팔레트를 새로 만들거나 파츠를 고칠 때 조용히 픽셀이 사라지는 것을 막는다.
 * 없는 인덱스 목록을 돌려주고, 비어 있으면 정상이다.
 */
export function missingIndices(matrix: Matrix, palette: Palette): readonly string[] {
  const missing = new Set<string>()
  for (const row of matrix) {
    for (const ch of row) {
      if (ch === '.') continue
      if (palette[ch] === undefined) missing.add(ch)
    }
  }
  return [...missing].sort()
}
