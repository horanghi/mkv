import { Texture } from 'pixi.js'
import { paletteFor, partsFor, type ArmorState } from '../sprite/armor.ts'
import { CLIPS, type ClipName } from '../sprite/clip.ts'
import type { Matrix } from '../sprite/matrix.ts'
import { SPRITE_SIZE } from '../sprite/matrix.ts'
import { colorAt, type Palette } from '../sprite/palette.ts'
import { pose } from '../sprite/pose.ts'

/**
 * 도트 매트릭스 → PixiJS 텍스처.
 *
 * 조립(`sprite/`)은 순수 데이터고, 여기서만 캔버스를 만진다.
 * 계측 대상이 아니다 — 시각으로 검증한다. → docs/10-tech-spec.md 10.9
 */

export function matrixToCanvas(matrix: Matrix, palette: Palette): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = matrix[0]?.length ?? SPRITE_SIZE
  canvas.height = matrix.length
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d 컨텍스트를 만들 수 없다')

  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = colorAt(palette, row[x] ?? '.')
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  })
  return canvas
}

export function matrixToTexture(matrix: Matrix, palette: Palette): Texture {
  const texture = Texture.from(matrixToCanvas(matrix, palette))
  texture.source.scaleMode = 'nearest'
  return texture
}

/**
 * 프레임 텍스처 캐시.
 *
 * 매 틱 조립하고 캔버스를 새로 굽는 것은 낭비다. 프레임은 유한하고 작으므로
 * (32×32 · 상태 4 · 클립 8) 필요할 때 한 번 구워 들고 있는다.
 */
export class SpriteSheet {
  private readonly cache = new Map<string, Texture>()

  frame(state: ArmorState, clip: ClipName, index: number, weaponId?: string): Texture {
    const keys = CLIPS[clip].keys
    const frameIndex = Math.max(0, Math.min(index, keys.length - 1))
    const key = `${state}|${clip}|${frameIndex}|${weaponId ?? '-'}`

    const cached = this.cache.get(key)
    if (cached) return cached

    const matrix = pose(partsFor(state), keys[frameIndex], weaponId)
    const texture = matrixToTexture(matrix, paletteFor(state))
    this.cache.set(key, texture)
    return texture
  }

  /** 미리 구워둔다. 첫 표시에서 끊기는 것을 막는다. */
  warmUp(states: readonly ArmorState[], clips: readonly ClipName[], weaponId?: string): void {
    for (const state of states) {
      for (const clip of clips) {
        CLIPS[clip].keys.forEach((_, i) => {
          this.frame(state, clip, i, clip === 'attack' ? weaponId : undefined)
        })
      }
    }
  }

  get size(): number {
    return this.cache.size
  }

  destroy(): void {
    for (const texture of this.cache.values()) texture.destroy(true)
    this.cache.clear()
  }
}
