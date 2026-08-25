import { Container, Sprite, type Texture } from 'pixi.js'
import { boxOfEnemy, type Enemy } from '../entities/enemies/enemy.ts'
import { ENEMY_SPRITES, enemyFrame } from '../sprite/enemies.ts'
import { matrixToTexture } from './spriteTexture.ts'

/**
 * 잡몹 그리기.
 *
 * 프레임은 유한하므로(종류 3 · 클립 2~3 · 프레임 1~2) 필요할 때 한 번 구워
 * 캐시한다. 스프라이트 객체는 풀에서 재사용한다 — 매 프레임 새로 만들면
 * 적 10마리에 10개의 GC 대상이 생긴다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 render/ 제외. 도트는 sprite/ 에서 검증한다.
 */
export class EnemyRenderer {
  private readonly cache = new Map<string, Texture>()
  private readonly pool: Sprite[] = []
  private readonly root = new Container()

  constructor(stage: Container) {
    stage.addChild(this.root)
  }

  draw(enemies: readonly Enemy[], tick: number): void {
    while (this.pool.length < enemies.length) {
      const sprite = new Sprite()
      // 좌우 반전을 위해 가로 기준점만 가운데로 둔다. 세로는 발밑이 기준이다.
      sprite.anchor.set(0.5, 0)
      this.pool.push(sprite)
      this.root.addChild(sprite)
    }

    this.pool.forEach((sprite, i) => {
      const enemy = enemies[i]
      if (enemy === undefined) {
        sprite.visible = false
        return
      }

      const art = ENEMY_SPRITES[enemy.kind]
      if (art === undefined) {
        sprite.visible = false
        return
      }

      sprite.visible = true
      // 맞은 순간에는 흰 실루엣으로 바꾼다. 틴트로는 원본보다 밝게 만들 수 없다.
      sprite.texture = this.textureFor(enemy, tick, enemy.hitFlash > 0)
      const box = boxOfEnemy(enemy)
      sprite.x = Math.round(box.x + box.width / 2)
      sprite.y = Math.round(box.y)
      sprite.scale.x = enemy.facing
    })
  }

  private textureFor(enemy: Enemy, tick: number, flash: boolean): Texture {
    const art = ENEMY_SPRITES[enemy.kind] as (typeof ENEMY_SPRITES)[string]
    const frames = art.clips[enemy.state] ?? art.clips['default'] ?? []
    const index = frames.length === 0 ? 0 : Math.floor(tick / art.frameTicks) % frames.length
    const clip = enemy.state in art.clips ? enemy.state : 'default'
    const key = `${enemy.kind}|${clip}|${index}|${flash ? 'f' : '-'}`

    const cached = this.cache.get(key)
    if (cached) return cached

    const matrix = enemyFrame(art, enemy.state, tick)
    const texture = flash
      ? matrixToTexture(whiten(matrix), WHITE_PALETTE)
      : matrixToTexture(matrix, art.palette)
    this.cache.set(key, texture)
    return texture
  }
}

const WHITE_PALETTE = { W: '#FFFFFF' } as const

/** 칠해진 픽셀을 전부 흰색으로. 실루엣만 남는다. */
function whiten(matrix: readonly string[]): readonly string[] {
  return matrix.map((row) => row.replace(/[^.]/g, 'W'))
}
