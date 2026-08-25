import {
  Container,
  Graphics,
  RenderTexture,
  Sprite,
  Texture,
  type Renderer,
} from 'pixi.js'
import { LIGHT_RT_SCALE, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../core/config.ts'
import { intensityAt, type Light } from '../../fx/light.ts'

/**
 * 2D 동적 광원.
 *
 * 광원을 절반 해상도 버퍼에 모아 그린 뒤, 씬 위에 곱하기로 얹는다.
 * 저해상도로 충분한 이유는 빛은 부드럽고 픽셀 경계가 보이지 않기 때문이다.
 * 그림자 캐스팅은 없다 — 2D 에서 비용 대비 효과가 낮다.
 * → docs/06-visual-direction.md 6.4 · docs/10-tech-spec.md 10.5
 */

const RT_WIDTH = Math.round(LOGICAL_WIDTH * LIGHT_RT_SCALE)
const RT_HEIGHT = Math.round(LOGICAL_HEIGHT * LIGHT_RT_SCALE)
/** 광원 하나를 그릴 원형 그라디언트의 원본 크기. */
const GRADIENT_SIZE = 128

export class LightLayer {
  private readonly texture: RenderTexture
  private readonly buffer = new Container()
  private readonly ambient = new Graphics()
  private readonly pool: Sprite[] = []
  private readonly gradient: Texture

  /** 씬 위에 곱하기로 얹는 스프라이트. 스테이지에 직접 추가한다. */
  readonly output: Sprite

  constructor() {
    this.gradient = makeGradientTexture()
    this.texture = RenderTexture.create({ width: RT_WIDTH, height: RT_HEIGHT, antialias: false })
    this.buffer.addChild(this.ambient)

    this.output = new Sprite(this.texture)
    this.output.blendMode = 'multiply'
    this.output.width = LOGICAL_WIDTH
    this.output.height = LOGICAL_HEIGHT
  }

  /**
   * 광원을 다시 그린다.
   *
   * `ambient` 는 빛이 없는 곳의 밝기다. 0 이면 칠흑이라 아무것도 안 보이므로
   * 스테이지 팔레트에 맞는 하한을 둔다.
   */
  update(renderer: Renderer, lights: readonly Light[], timeMs: number, ambient = 0x4a4458): void {
    this.ambient.clear().rect(0, 0, RT_WIDTH, RT_HEIGHT).fill(ambient)

    // 필요한 만큼만 스프라이트를 늘린다. 매 프레임 새로 만들지 않는다.
    while (this.pool.length < lights.length) {
      const sprite = new Sprite(this.gradient)
      sprite.anchor.set(0.5)
      sprite.blendMode = 'add'
      this.pool.push(sprite)
      this.buffer.addChild(sprite)
    }

    this.pool.forEach((sprite, i) => {
      const light = lights[i]
      if (!light) {
        sprite.visible = false
        return
      }
      sprite.visible = true
      sprite.position.set(light.x * LIGHT_RT_SCALE, light.y * LIGHT_RT_SCALE)
      const diameter = light.radius * 2 * LIGHT_RT_SCALE
      sprite.width = diameter
      sprite.height = diameter
      sprite.tint = light.color
      sprite.alpha = Math.min(1, intensityAt(light, timeMs))
    })

    renderer.render({ container: this.buffer, target: this.texture, clear: true })
  }

  /** 광원을 끈다 (품질 '낮음'). 곱하기 층 자체를 치운다. */
  setEnabled(enabled: boolean): void {
    this.output.visible = enabled
  }

  destroy(): void {
    this.texture.destroy(true)
    this.gradient.destroy(true)
    this.buffer.destroy({ children: true })
  }
}

/**
 * 원형 감쇠 그라디언트.
 *
 * 캔버스 그라디언트를 한 번 구워 모든 광원이 재사용한다.
 * 광원마다 셰이더를 도는 것보다 훨씬 싸다.
 */
function makeGradientTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = GRADIENT_SIZE
  canvas.height = GRADIENT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d 컨텍스트를 만들 수 없다')

  const half = GRADIENT_SIZE / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  // 반경 안이 고르게 밝고 가장자리에서 빠르게 떨어진다 — fx/light.ts 의 감쇠와 맞춘다.
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.72)')
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.28)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, GRADIENT_SIZE, GRADIENT_SIZE)
  return Texture.from(canvas)
}
