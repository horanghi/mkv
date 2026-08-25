import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/config.ts'
import { shardAlpha, type Shard } from '../fx/shard.ts'

/**
 * 갑옷 파괴 연출의 그리기 담당.
 *
 * 타이밍은 `fx/sequence.ts` 가 정하고 여기서는 그리기만 한다.
 * 계측 대상이 아니다 — 시각으로 검증한다.
 * → docs/06-visual-direction.md 6.3
 */
export class BreakFx {
  private readonly shardGfx = new Graphics()
  private readonly ringGfx = new Graphics()
  private readonly invertGfx = new Graphics()
  /** 스프라이트 위에 겹쳐 태우는 백색 사본. additive 라 밝아진다. */
  readonly flash: Sprite

  constructor(scene: Container, overlay: Container) {
    this.flash = new Sprite(Texture.EMPTY)
    this.flash.anchor.set(0.5, 1)
    this.flash.blendMode = 'add'
    this.flash.visible = false

    scene.addChild(this.shardGfx, this.ringGfx, this.flash)

    // 화면 반전은 씬 위에 얹는다 — 셰이크의 영향을 받지 않아야 한다.
    this.invertGfx.visible = false
    overlay.addChild(this.invertGfx)
  }

  drawShards(shards: readonly Shard[], holdMs: number): void {
    const g = this.shardGfx.clear()
    for (const shard of shards) {
      const alpha = shardAlpha(shard, holdMs)
      if (alpha <= 0) continue
      // 회전은 1px 조각이라 각도로 보이지 않는다. 대신 굴러가는 느낌만 준다.
      const wobble = shard.resting ? 0 : Math.round(Math.sin(shard.rotation) * 0.5)
      g.rect(Math.round(shard.x) + wobble, Math.round(shard.y), 1, 1).fill({
        color: shard.color,
        alpha,
      })
    }
  }

  /** 방사형 섬광 링. 반경 8 → 96px 로 퍼지며 사라진다. */
  drawRing(x: number, y: number, radius: number, alpha: number): void {
    const g = this.ringGfx.clear()
    if (alpha <= 0) return
    g.circle(Math.round(x), Math.round(y), Math.round(radius))
      .stroke({ width: 2, color: 0xfff6d0, alpha })
  }

  /** 스프라이트 전체 백색 플래시. 텍스처를 그대로 받아 겹친다. */
  drawFlash(texture: Texture, x: number, y: number, scaleX: number, alpha: number): void {
    if (alpha <= 0) {
      this.flash.visible = false
      return
    }
    this.flash.visible = true
    this.flash.texture = texture
    this.flash.position.set(x, y)
    this.flash.scale.x = scaleX
    this.flash.alpha = alpha
    this.flash.tint = 0xffffff
  }

  /** 화면 전체 순간 반전 1프레임. difference 블렌드라 실제로 색이 뒤집힌다. */
  setInvert(on: boolean): void {
    this.invertGfx.visible = on
    if (!on) return
    this.invertGfx.clear().rect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT).fill(0xffffff)
    this.invertGfx.blendMode = 'difference'
  }

  clear(): void {
    this.shardGfx.clear()
    this.ringGfx.clear()
    this.flash.visible = false
    this.invertGfx.visible = false
  }
}
