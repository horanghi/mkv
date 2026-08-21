import { Application, Container, Graphics, TextureSource } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TILE_SIZE } from './core/config.ts'
import { computeViewport } from './core/viewport.ts'
import { loadBalance } from './data/load.ts'
import { DebugOverlay, type DebugMetrics } from './render/debug/overlay.ts'

/**
 * 부트스트랩. 게임 로직은 없다 — m0-2 에서 `core/loop.ts` 가 들어온다.
 *
 * 여기서 확인할 것은 하나다: 480x270 이 정수 배율로 올라가고,
 * 밸런스 JSON 이 파싱되고, 디버그 오버레이가 뜨는가.
 */

// 픽셀아트 기본값. 이걸 빼먹으면 모든 스프라이트가 뭉갠 채로 올라온다.
TextureSource.defaultOptions.scaleMode = 'nearest'

const host = document.querySelector<HTMLElement>('#app')
if (!host) throw new Error('#app 이 없다')

const balance = loadBalance()

const app = new Application()
await app.init({
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  background: '#0B0710',
  antialias: false,
  roundPixels: true,
  autoDensity: false,
  resolution: 1,
})

host.style.position = 'relative'
host.appendChild(app.canvas)

const overlay = new DebugOverlay(host)

// --- 그레이 박스 플레이스홀더 -------------------------------------------------
// 타일 격자와 플레이어 히트박스만. M0 는 아트를 만들지 않는다.
const scene = new Container()
app.stage.addChild(scene)

const grid = new Graphics()
for (let x = 0; x <= LOGICAL_WIDTH; x += TILE_SIZE) {
  grid.moveTo(x, 0).lineTo(x, LOGICAL_HEIGHT)
}
for (let y = 0; y <= LOGICAL_HEIGHT; y += TILE_SIZE) {
  grid.moveTo(0, y).lineTo(LOGICAL_WIDTH, y)
}
grid.stroke({ width: 1, color: 0x241c2e })
scene.addChild(grid)

const ground = new Graphics()
  .rect(0, LOGICAL_HEIGHT - TILE_SIZE * 2, LOGICAL_WIDTH, TILE_SIZE * 2)
  .fill(0x2a2438)
scene.addChild(ground)

const player = new Graphics()
  .rect(0, 0, balance.player.hitbox.width, balance.player.hitbox.height)
  .fill(0x8695ac)
player.position.set(64, LOGICAL_HEIGHT - TILE_SIZE * 2 - balance.player.hitbox.height)
scene.addChild(player)

// --- 뷰포트 -------------------------------------------------------------------
function applyViewport(): void {
  const vp = computeViewport(window.innerWidth, window.innerHeight)
  app.canvas.style.width = `${vp.width}px`
  app.canvas.style.height = `${vp.height}px`
}
applyViewport()
window.addEventListener('resize', applyViewport)

// --- 디버그 -------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault()
    overlay.toggle()
  }
})

// 임시 계측. m0-2 에서 고정 타임스텝 루프로 교체된다.
let frames = 0
let fps = 0
let lastSecond = performance.now()

app.ticker.add(() => {
  frames += 1
  const now = performance.now()
  if (now - lastSecond >= 1000) {
    fps = (frames * 1000) / (now - lastSecond)
    frames = 0
    lastSecond = now
  }

  const metrics: DebugMetrics = {
    fps,
    frameMs: app.ticker.deltaMS,
    logicMs: 0,
    renderMs: 0,
    tick: 0,
    entities: 1,
    state: 'boot',
  }
  overlay.render(metrics)
})

console.info(
  `[grimhollow] 밸런스 로드 완료 — 무기 ${balance.weapons.length}, 적 ${balance.enemies.length}, 보스 ${balance.bosses.length}`,
)
