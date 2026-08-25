import { Container, Graphics, Sprite, type Texture } from 'pixi.js'
import {
  bodyBox, coreBox, isCoreExposed, isWindingUp, slamBox, type Cairn,
} from '../entities/bosses/cairn.ts'
import {
  CAIRN_OFFSETS, PAL_CAIRN, cairnFrame, cairnPose, fragmentFrame,
} from '../sprite/cairn.ts'
import type { Matrix } from '../sprite/matrix.ts'
import { matrixToTexture } from './spriteTexture.ts'

/**
 * 캐른 그리기.
 *
 * 포즈 조합이 유한하므로(상태 6 × 예비/타격 2 + 호흡 2) 구운 텍스처를 캐시한다.
 * 56×52 를 매 프레임 조립하면 그것만으로 프레임 예산을 넘긴다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 render/ 제외. 조립은 sprite/ 에서 검증한다.
 */
export class CairnRenderer {
  private readonly cache = new Map<string, Texture>()
  private readonly body = new Sprite()
  private readonly fragments: Sprite[] = []
  private readonly slam = new Graphics()
  private readonly root = new Container()

  constructor(stage: Container) {
    this.body.anchor.set(0, 0)
    this.root.addChild(this.body)
    for (let i = 0; i < 4; i += 1) {
      const sprite = new Sprite()
      sprite.visible = false
      this.fragments.push(sprite)
      this.root.addChild(sprite)
    }
    this.root.addChild(this.slam)
    stage.addChild(this.root)
  }

  draw(cairn: Cairn, tick: number): void {
    const visible = cairn.awake && cairn.state !== 'dead'
    this.root.visible = visible
    if (!visible) {
      this.slam.clear()
      return
    }

    const pose = cairnPose(cairn.state, cairn.stateFrames, tick)
    const flash = cairn.hitFlash > 0
    const key = `${cairn.state}|${JSON.stringify(pose)}|${flash ? 'f' : '-'}`

    this.body.texture = this.textureFor(key, () => cairnFrame(pose), flash)
    const box = bodyBox(cairn)
    this.body.x = Math.round(box.x)
    this.body.y = Math.round(box.y)
    // 예비 동작 중에는 밝아진다. 실루엣 변화만으로는 부족하다.
    this.body.tint = isWindingUp(cairn) ? 0xffffff : 0xcfd4dc

    this.fragments.forEach((sprite, i) => {
      const fragment = cairn.fragments[i]
      if (fragment === undefined) {
        sprite.visible = false
        return
      }
      sprite.visible = true
      sprite.texture = this.textureFor(`frag${i}|${flash ? 'f' : '-'}`, () => fragmentFrame(i), flash)
      // 판정은 14×14 이고 그림은 그보다 크다. 판정 상자의 중심에 맞춘다.
      sprite.x = Math.round(fragment.x + 7 - sprite.texture.width / 2)
      sprite.y = Math.round(fragment.y + 7 - sprite.texture.height / 2)
      sprite.tint = 0xcfd4dc
    })

    const g = this.slam.clear()
    const box2 = slamBox(cairn)
    if (box2) {
      g.rect(Math.round(box2.x), Math.round(box2.y), box2.width, box2.height)
        .fill({ color: 0xe23e4e, alpha: 0.85 })
    }
  }

  /** 코어의 화면 위치. 발광 스프라이트를 여기에 맞춘다. */
  static coreCenter(cairn: Cairn): { readonly x: number; readonly y: number } {
    const core = coreBox(cairn)
    return { x: core.x + core.width / 2, y: core.y + core.height / 2 }
  }

  static coreBrightness(cairn: Cairn): number {
    return isCoreExposed(cairn) ? 0.95 : 0.7
  }

  private textureFor(key: string, build: () => Matrix, flash: boolean): Texture {
    const cached = this.cache.get(key)
    if (cached) return cached

    const matrix = build()
    const texture = flash
      ? matrixToTexture(matrix.map((row) => row.replace(/[^.]/g, 'W')), WHITE_PALETTE)
      : matrixToTexture(matrix, PAL_CAIRN)
    this.cache.set(key, texture)
    return texture
  }
}

const WHITE_PALETTE = { W: '#FFFFFF' } as const

/** 코어가 몸통 어디에 붙어 있는가. 발광 위치를 맞추는 데 쓴다. */
export const CORE_OFFSET = CAIRN_OFFSETS.CORE
