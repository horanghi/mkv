import { BlurFilter, Container, RenderTexture, Sprite, type Renderer } from 'pixi.js'
import { BLOOM_RT_SCALES, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../core/config.ts'

/**
 * 발광 마스크 블룸.
 *
 * **전역 블룸을 걸지 않는다.** 픽셀아트에 전역 블룸을 그냥 씌우면 밝은 타일이
 * 무의미하게 번져 화면이 뿌옇게 뭉개진다. 빛나야 할 것만 별도 채널에 그리고
 * 그 채널만 번지게 한다 — 화염, 마법, 인광, 성유물 갑옷.
 *
 * 다운샘플 3단(1/2, 1/4, 1/8)을 겹쳐 넓은 헤일로와 좁은 코어를 함께 얻는다.
 * → docs/06-visual-direction.md 6.4 · docs/10-tech-spec.md 10.5
 */

/** docs/06 — 강도 1.2 */
const INTENSITY = 1.2

interface BloomPass {
  readonly texture: RenderTexture
  readonly sprite: Sprite
  readonly blur: BlurFilter
}

export class BloomLayer {
  /** 발광 오브젝트를 여기 넣는다. 씬에는 그리지 않는다. */
  readonly emissive = new Container()
  /** 씬 위에 additive 로 얹는 층. */
  readonly output = new Container()

  private readonly passes: BloomPass[]

  constructor() {
    this.passes = BLOOM_RT_SCALES.map((scale, i) => {
      const texture = RenderTexture.create({
        width: Math.max(1, Math.round(LOGICAL_WIDTH * scale)),
        height: Math.max(1, Math.round(LOGICAL_HEIGHT * scale)),
        antialias: false,
      })
      const sprite = new Sprite(texture)
      sprite.width = LOGICAL_WIDTH
      sprite.height = LOGICAL_HEIGHT
      sprite.blendMode = 'add'
      // 작은 단계일수록 넓게 번지므로 약하게 섞는다. 안 그러면 화면이 하얘진다.
      sprite.alpha = (INTENSITY / BLOOM_RT_SCALES.length) * (1 - i * 0.2)
      this.output.addChild(sprite)
      return { texture, sprite, blur: new BlurFilter({ strength: 2 + i * 2, quality: 2 }) }
    })
  }

  /** 발광 채널을 굽고 단계별로 번지게 한다. */
  update(renderer: Renderer): void {
    for (const pass of this.passes) {
      this.emissive.filters = [pass.blur]
      renderer.render({ container: this.emissive, target: pass.texture, clear: true })
    }
    this.emissive.filters = []
  }

  setEnabled(enabled: boolean): void {
    this.output.visible = enabled
  }

  destroy(): void {
    for (const pass of this.passes) pass.texture.destroy(true)
    this.output.destroy({ children: true })
    this.emissive.destroy({ children: true })
  }
}
