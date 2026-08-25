import { Container, Graphics } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/config.ts'
import { createRng } from '../core/rng.ts'
import type { Prop } from '../scenery/props.ts'
import { scatter } from '../scenery/props.ts'
import { cloudBands } from '../scenery/clouds.ts'
import { columns, ridgeline } from '../scenery/silhouette.ts'
import {
  CANOPY, CLOUDS, FOG, S1_PALETTE, S1_SCENERY, WISPS, type SceneryLayer,
} from '../scenery/stage1.ts'

/**
 * 배경 8층 중 1~4층과 7층을 그린다.
 *
 * 모양은 `scenery/` 가 시드에서 만들고 여기서는 그리기만 한다.
 * 층마다 한 번만 그려 두고 매 프레임 **위치만** 옮긴다 — 배경을 매 프레임
 * 다시 그리면 프레임 예산(로직 4ms)을 배경이 다 먹는다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 render/ 제외. 모양은 scenery/ 에서 검증한다.
 * → docs/06-visual-direction.md 6.2, docs/10-tech-spec.md 10.9
 */

interface Band {
  readonly view: Container
  readonly parallax: number
  /** 반복 구간의 폭 */
  readonly span: number
}

export class ParallaxRenderer {
  private readonly bands: Band[] = []
  private readonly sky = new Graphics()
  private readonly clouds = new Graphics()
  private readonly cloudRoot = new Container()
  private readonly canopy = new Graphics()
  private readonly canopyRoot = new Container()
  private readonly topInset: number
  private readonly fog = new Graphics()
  /** 씬에 보이는 알맹이 */
  private readonly wisps = new Graphics()
  /** 블룸을 타는 번짐. 같은 자리에 한 벌 더 그린다 */
  private readonly wispGlow = new Graphics()
  private readonly fogRoot = new Container()
  /**
   * 도깨비불은 화면 좌표로 그린다. 발광 컨테이너는 카메라만큼 밀려 있으므로
   * 그만큼 되돌려 놓아야 화면에 붙는다.
   */
  private readonly wispRoot = new Container()

  /**
   * @param topInset 전경 나뭇가지를 걸 y. HUD 바 아래여야 보인다.
   */
  constructor(backdrop: Container, foreground: Container, emissive: Container, topInset = 0) {
    this.topInset = topInset
    this.drawSky()
    backdrop.addChild(this.sky)

    this.drawClouds()
    this.cloudRoot.addChild(this.clouds)
    backdrop.addChild(this.cloudRoot)

    for (const layer of S1_SCENERY) {
      const band = this.buildBand(layer)
      backdrop.addChild(band.view)
      this.bands.push(band)
    }

    this.drawFog()
    this.fogRoot.addChild(this.fog)
    foreground.addChild(this.fogRoot)

    // 7층 나뭇가지. 안개보다 앞에 온다 — 더 가까운 것이다.
    this.drawCanopy()
    this.canopyRoot.addChild(this.canopy)
    foreground.addChild(this.canopyRoot)

    // 발광 컨테이너는 렌더 타겟으로만 구워진다. 거기에만 그리면 번짐만 남고
    // 알맹이가 없어 아무것도 안 보인다. 씬에도 한 벌 그린다.
    backdrop.addChild(this.wisps)
    this.wispRoot.addChild(this.wispGlow)
    emissive.addChild(this.wispRoot)
  }

  /** 매 프레임. 카메라를 따라 층을 밀고 도깨비불을 흔든다. */
  update(cameraX: number, cameraY: number, timeSeconds: number): void {
    for (const band of this.bands) {
      // 반복 구간 하나 안에서만 움직인다. 층은 이미 화면보다 넓게 그려 뒀다.
      band.view.x = -wrap(cameraX * band.parallax, band.span)
      band.view.y = -cameraY * band.parallax
    }
    this.sky.y = -cameraY * 0.04
    // 구름은 카메라와 시간 둘 다에 반응한다. 서 있어도 하늘이 흐른다.
    this.cloudRoot.x = -wrap(
      cameraX * 0.03 + timeSeconds * CLOUDS.driftPxPerSecond, CLOUDS.spanX)
    this.cloudRoot.y = -cameraY * 0.03

    this.canopyRoot.x = -wrap(cameraX * CANOPY.parallax, CANOPY.spanX)
    this.canopyRoot.y = this.topInset - cameraY * CANOPY.parallax * 0.3

    this.fogRoot.x = -wrap(cameraX * FOG.parallax, FOG.spanX)
    this.fogRoot.y = -cameraY * 0.2

    this.wispRoot.position.set(Math.round(cameraX), Math.round(cameraY))
    this.drawWisps(cameraX, cameraY, timeSeconds)
  }

  /**
   * 하늘 — 세로 그라디언트.
   *
   * 셰이더 대신 1px 가로 막대를 쌓는다. 픽셀 단위로 끊긴 계조가 오히려
   * 이 게임의 해상도(480×270)에 맞고, 패스를 하나 아낀다.
   */
  private drawSky(): void {
    const g = this.sky.clear()
    const top = unpack(S1_PALETTE.skyTop)
    const bottom = unpack(S1_PALETTE.skyBottom)

    for (let y = 0; y < LOGICAL_HEIGHT; y += 1) {
      const t = y / (LOGICAL_HEIGHT - 1)
      g.rect(0, y, LOGICAL_WIDTH, 1).fill(mix(top, bottom, t))
    }
  }

  /** 구름 — 옅은 가로 띠. 반복 구간을 화면보다 넓게 이어 붙인다. */
  private drawClouds(): void {
    const g = this.clouds.clear()
    const copies = Math.ceil(LOGICAL_WIDTH / CLOUDS.spanX) + 1
    const bands = cloudBands(createRng(CLOUDS.seed), { ...CLOUDS, width: CLOUDS.spanX })

    for (let copy = 0; copy < copies; copy += 1) {
      const offset = copy * CLOUDS.spanX
      for (const cloud of bands) {
        // 양 끝을 한 픽셀씩 좁혀 띠가 아니라 덩어리로 보이게 한다.
        g.rect(offset + cloud.x, cloud.y, cloud.width, cloud.height)
          .fill({ color: CLOUDS.color, alpha: cloud.alpha })
        g.rect(offset + cloud.x + 6, cloud.y - 1, cloud.width - 12, 1)
          .fill({ color: CLOUDS.color, alpha: cloud.alpha * 0.6 })
      }
    }
  }

  /**
   * 전경 나뭇가지 — 화면 맨 위에 매달린다.
   *
   * 능선을 뒤집어 쓴다. 위에서 내려오는 실루엣은 아래에서 솟는 것과
   * 같은 모양 문제이므로 같은 생성기를 쓴다.
   */
  private drawCanopy(): void {
    const g = this.canopy.clear()
    const copies = Math.ceil(LOGICAL_WIDTH / CANOPY.spanX) + 1
    const depths = ridgeline(createRng(CANOPY.seed), {
      width: CANOPY.spanX,
      steps: 7,
      minHeight: CANOPY.minDepth,
      maxHeight: CANOPY.maxDepth,
      jag: 0.9,
    })

    for (let copy = 0; copy < copies; copy += 1) {
      const offset = copy * CANOPY.spanX
      for (const column of columns(depths)) {
        g.rect(offset + column.x, 0, column.width, column.height)
      }
    }
    g.fill(CANOPY.color)
  }

  /**
   * 한 층을 그린다.
   *
   * 반복 구간을 화면보다 넓어질 때까지 옆으로 이어 붙인다. 한 벌 더 붙이는
   * 이유는 오른쪽 끝이 비는 순간이 있기 때문이다.
   */
  private buildBand(layer: SceneryLayer): Band {
    const span = layer.kind === 'ridge' ? layer.ridge.width : layer.scatter.width
    const copies = Math.ceil(LOGICAL_WIDTH / span) + 1
    const view = new Container()
    const g = new Graphics()
    const baseline = LOGICAL_HEIGHT - layer.baseY

    for (let copy = 0; copy < copies; copy += 1) {
      const offset = copy * span
      if (layer.kind === 'ridge') {
        for (const column of columns(ridgeline(createRng(layer.seed), layer.ridge))) {
          g.rect(offset + column.x, baseline - column.height, column.width, column.height + layer.baseY)
        }
      } else {
        for (const prop of scatter(createRng(layer.seed), layer.scatter)) {
          drawProp(g, prop, offset, baseline)
        }
        // 소품만 있으면 층이 공중에 뜬 것처럼 보인다. 바닥선을 한 줄 깐다.
        g.rect(offset, baseline, span, layer.baseY)
      }
    }

    g.fill(layer.color)
    view.addChild(g)
    return { view, parallax: layer.parallax, span }
  }

  /** 전경 안개 — 윗면을 물결지게 해 밀리는 것이 보이게 한다. */
  private drawFog(): void {
    const g = this.fog.clear()
    const copies = Math.ceil(LOGICAL_WIDTH / FOG.spanX) + 1
    const top = LOGICAL_HEIGHT - FOG.height

    for (let copy = 0; copy < copies; copy += 1) {
      const offset = copy * FOG.spanX
      for (let x = 0; x < FOG.spanX; x += 4) {
        const bump = Math.round(Math.sin((x / FOG.spanX) * Math.PI * 4) * 2)
        g.rect(offset + x, top + bump, 4, FOG.height - bump)
      }
    }
    g.fill({ color: FOG.color, alpha: FOG.alpha })
  }

  /**
   * 도깨비불 — 유일하게 밝은 것.
   *
   * 발광 컨테이너에 그리므로 블룸을 탄다. 매 프레임 다시 그리지만 14개뿐이다.
   */
  private drawWisps(cameraX: number, cameraY: number, timeSeconds: number): void {
    const g = this.wisps.clear()
    const glow = this.wispGlow.clear()
    const shiftX = wrap(cameraX * WISPS.parallax, WISPS.spanX)

    for (let i = 0; i < WISPS.count; i += 1) {
      // 균등하게 늘어놓고 소수부로 흩는다. 난수 상태를 매 프레임 굴리지 않는다.
      const seed = (i * 2654435761) % 1000 / 1000
      const spanY = WISPS.maxY - WISPS.minY
      const baseX = ((i / WISPS.count) * WISPS.spanX + seed * 40) % WISPS.spanX
      const baseY = WISPS.minY + ((seed * 7919) % spanY)

      const phase = (timeSeconds / WISPS.periodSeconds + seed) * Math.PI * 2
      const y = baseY + Math.sin(phase) * WISPS.driftY - cameraY * WISPS.parallax

      // 화면 왼쪽 밖으로 나간 것은 오른쪽 끝으로 돌린다.
      const x = wrap(baseX - shiftX, WISPS.spanX)
      if (x > LOGICAL_WIDTH + WISPS.radius) continue

      const pulse = 0.55 + 0.45 * Math.sin(phase * 1.7)
      g.circle(x, y, WISPS.radius).fill({ color: WISPS.color, alpha: pulse })
      // 번짐은 알맹이보다 크게. 블룸이 이걸 받아 퍼뜨린다.
      glow.circle(x, y, WISPS.radius * 2.2).fill({ color: WISPS.color, alpha: pulse * 0.8 })
    }
  }
}

/** [0, span) 으로 접는다. 음수 카메라에서도 정상이어야 한다. */
function wrap(value: number, span: number): number {
  const folded = value % span
  return folded < 0 ? folded + span : folded
}

function drawProp(g: Graphics, prop: Prop, offset: number, baseline: number): void {
  const x = offset + prop.x
  const top = baseline - prop.height
  const lean = prop.flipped ? -1 : 1

  switch (prop.kind) {
    case 'cross': {
      const arm = Math.max(1, Math.floor(prop.width / 3))
      g.rect(x + arm, top, arm, prop.height)
      g.rect(x, top + arm, prop.width, arm)
      break
    }
    case 'pillar': {
      const cap = Math.max(1, Math.floor(prop.width / 4))
      g.rect(x - cap, top, prop.width + cap * 2, cap * 2)
      g.rect(x, top, prop.width, prop.height)
      g.rect(x - cap, baseline - cap * 2, prop.width + cap * 2, cap * 2)
      break
    }
    case 'tree': {
      const trunk = Math.max(2, Math.floor(prop.width / 5))
      const mid = x + Math.floor(prop.width / 2) - Math.floor(trunk / 2)
      g.rect(mid, top, trunk, prop.height)
      // 가지 — 위로 갈수록 짧아진다
      for (let i = 0; i < 3; i += 1) {
        const branchY = top + Math.floor((prop.height / 5) * (i + 1))
        const reach = Math.floor((prop.width / 2) * (1 - i * 0.22)) * (i % 2 === 0 ? lean : -lean)
        const bx = reach < 0 ? mid + reach : mid
        g.rect(bx, branchY, Math.abs(reach) + trunk, Math.max(1, trunk - 1))
      }
      break
    }
    case 'crypt': {
      const roof = Math.max(2, Math.floor(prop.height / 3))
      const body = prop.height - roof
      g.rect(x, top + roof, prop.width, body)
      // 박공지붕 — 계단으로 쌓는다
      for (let i = 0; i < roof; i += 1) {
        const inset = Math.floor((prop.width / 2) * (i / roof))
        g.rect(x + inset, top + i, prop.width - inset * 2, 1)
      }
      break
    }
    default: {
      // 묘비 — 윗면을 한 단 좁힌다
      const shoulder = Math.max(1, Math.floor(prop.width / 4))
      g.rect(x + shoulder, top, prop.width - shoulder * 2, prop.height)
      g.rect(x, top + shoulder, prop.width, prop.height - shoulder)
    }
  }
}

function unpack(color: number): readonly [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
}

function mix(a: readonly [number, number, number], b: readonly [number, number, number], t: number): number {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return (r << 16) | (g << 8) | bl
}
