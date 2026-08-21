import { Container, Graphics } from 'pixi.js'
import { boxOf, type Body } from '../../physics/body.ts'
import { warningProgress, type CrumbleState } from '../../physics/crumble.ts'
import { TILE, tileAt, type Tilemap } from '../../physics/tilemap.ts'

/**
 * 그레이박스 렌더러 — 아트가 들어오기 전까지 지형과 바디를 사각형으로 그린다.
 *
 * M0 는 아트를 만들지 않는다. 여기서 봐야 할 것은 모양이 아니라
 * **충돌이 맞게 풀리는가**다. → GOAL.md "M0 grey box"
 */

const COLOR = {
  grid: 0x241c2e,
  solid: 0x2a2438,
  oneWay: 0x5f6e85,
  crumbling: 0x8a5f14,
  crumblingWarn: 0xe23e4e,
  hazard: 0x7e1f2c,
  body: 0x8695ac,
  bodyGrounded: 0xf0c04a,
} as const

export class GreyboxRenderer {
  private readonly grid = new Graphics()
  private readonly terrain = new Graphics()
  private readonly bodies = new Graphics()

  constructor(stage: Container) {
    stage.addChild(this.grid, this.terrain, this.bodies)
  }

  /** 격자는 지형과 달리 매 틱 다시 그릴 필요가 없다. */
  drawGrid(map: Tilemap): void {
    const g = this.grid.clear()
    const w = map.width * map.tileSize
    const h = map.height * map.tileSize
    for (let x = 0; x <= w; x += map.tileSize) g.moveTo(x, 0).lineTo(x, h)
    for (let y = 0; y <= h; y += map.tileSize) g.moveTo(0, y).lineTo(w, y)
    g.stroke({ width: 1, color: COLOR.grid })
  }

  drawTerrain(map: Tilemap, crumble: CrumbleState): void {
    const g = this.terrain.clear()
    const size = map.tileSize

    for (let ty = 0; ty < map.height; ty += 1) {
      for (let tx = 0; tx < map.width; tx += 1) {
        const kind = tileAt(map, tx, ty)
        if (kind === TILE.empty) continue

        const x = tx * size
        const y = ty * size

        if (kind === TILE.solid) {
          g.rect(x, y, size, size).fill(COLOR.solid)
        } else if (kind === TILE.oneWay) {
          // 위에서만 밟힌다는 것이 실루엣으로 읽혀야 한다.
          g.rect(x, y, size, 4).fill(COLOR.oneWay)
        } else if (kind === TILE.hazard) {
          g.rect(x, y + size - 6, size, 6).fill(COLOR.hazard)
        } else if (kind === TILE.crumbling) {
          drawCrumbling(g, x, y, size, warningProgress(crumble, map, tx, ty))
        }
      }
    }
  }

  drawBodies(bodies: readonly Body[]): void {
    const g = this.bodies.clear()
    for (const body of bodies) {
      const box = boxOf(body)
      g.rect(box.x, box.y, box.width, box.height).fill(
        body.onGround ? COLOR.bodyGrounded : COLOR.body,
      )
    }
  }
}

/**
 * 붕괴 경고.
 *
 * 흔들림과 색이 진행도에 비례한다. 플레이어가 **다음 점프를 결정하기 전에**
 * 위험을 읽어야 하므로 접촉 즉시 눈에 띄어야 한다.
 */
function drawCrumbling(g: Graphics, x: number, y: number, size: number, progress: number): void {
  if (progress <= 0) {
    g.rect(x, y, size, size).fill(COLOR.crumbling)
    return
  }
  const shake = Math.sin(progress * 60) * progress * 1.5
  const color = progress > 0.6 ? COLOR.crumblingWarn : COLOR.crumbling
  g.rect(x + shake, y, size, size).fill({ color, alpha: 1 - progress * 0.35 })
}
