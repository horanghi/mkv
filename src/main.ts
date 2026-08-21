import { Application, Container, Graphics, TextureSource } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_RATE, TILE_SIZE } from './core/config.ts'
import { INITIAL_INPUT, advanceInput, isDown, type InputState } from './core/input.ts'
import { KeyboardSource } from './core/keyboard.ts'
import { INITIAL_LOOP, advance, requestHitstop, type LoopState } from './core/loop.ts'
import { computeViewport } from './core/viewport.ts'
import { loadBalance } from './data/load.ts'
import { DebugOverlay, type DebugMetrics } from './render/debug/overlay.ts'

/**
 * 부트스트랩 + 고정 타임스텝 루프 구동.
 *
 * 아직 움직이는 것은 없다 — 이동·충돌은 m0-3, m0-4 다.
 * 여기서 눈으로 확인할 것은 두 가지다.
 *   1. tps 가 60.0 에 붙어 있고 프레임 그래프가 평평한가
 *   2. X 를 눌러 히트스톱을 걸면 **틱만** 멈추고 UI 는 계속 도는가
 */

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
const keyboard = new KeyboardSource(window)

// --- 그레이 박스 플레이스홀더 -------------------------------------------------
const scene = new Container()
app.stage.addChild(scene)

const grid = new Graphics()
for (let x = 0; x <= LOGICAL_WIDTH; x += TILE_SIZE) grid.moveTo(x, 0).lineTo(x, LOGICAL_HEIGHT)
for (let y = 0; y <= LOGICAL_HEIGHT; y += TILE_SIZE) grid.moveTo(0, y).lineTo(LOGICAL_WIDTH, y)
grid.stroke({ width: 1, color: 0x241c2e })
scene.addChild(grid)

const ground = new Graphics()
  .rect(0, LOGICAL_HEIGHT - TILE_SIZE * 2, LOGICAL_WIDTH, TILE_SIZE * 2)
  .fill(0x2a2438)
scene.addChild(ground)

const box = new Graphics()
  .rect(0, 0, balance.player.hitbox.width, balance.player.hitbox.height)
  .fill(0x8695ac)
box.position.set(64, LOGICAL_HEIGHT - TILE_SIZE * 2 - balance.player.hitbox.height)
scene.addChild(box)

/** 틱이 실제로 돌고 있음을 보여주는 표시기. 1초에 한 바퀴 돈다. */
const tickHand = new Graphics()
tickHand.position.set(LOGICAL_WIDTH - 24, 24)
scene.addChild(tickHand)

// --- 루프 ---------------------------------------------------------------------
let loop: LoopState = INITIAL_LOOP
let input: InputState = INITIAL_INPUT

let lastFrameAt = performance.now()
let logicMs = 0

/**
 * 틱이 소비하기 전까지 프레임 입력을 모아둔다.
 *
 * 120Hz·144Hz 화면에서는 틱이 하나도 안 도는 프레임이 생긴다. 거기서 폴링한
 * 입력을 그냥 버리면 짧은 탭이 통째로 사라진다 — 틱이 돌 때 비운다.
 */
let pendingFrame = 0

// 최근 1초 계측
let framesInWindow = 0
let ticksInWindow = 0
let windowStart = lastFrameAt
let fps = 0
let ticksPerSecond = 0
let droppedTicks = 0

app.ticker.add(() => {
  const now = performance.now()
  const frameMs = now - lastFrameAt
  lastFrameAt = now

  // 폴링은 히트스톱 중에도 멈추지 않는다 — 입력을 삼키면 안 된다.
  pendingFrame |= keyboard.poll()

  const stepped = advance(loop, frameMs)
  loop = stepped.state
  droppedTicks = stepped.droppedTicks

  const logicStart = performance.now()
  for (let i = 0; i < stepped.ticks; i += 1) {
    // 캐치업 틱은 같은 입력을 유지한다.
    input = advanceInput(input, pendingFrame)

    // 히트스톱 시연: 공격 키로 갑옷 파괴와 같은 180ms 를 건다 (GOAL 비협상 원칙 4).
    if (isDown(input.pressed, 'attack')) loop = requestHitstop(loop, 180)
  }
  logicMs = performance.now() - logicStart
  if (stepped.ticks > 0) pendingFrame = 0

  ticksInWindow += stepped.ticks
  framesInWindow += 1
  if (now - windowStart >= 1000) {
    const seconds = (now - windowStart) / 1000
    fps = framesInWindow / seconds
    ticksPerSecond = ticksInWindow / seconds
    framesInWindow = 0
    ticksInWindow = 0
    windowStart = now
  }

  // 렌더는 히트스톱 중에도 계속 돈다.
  const angle = ((loop.tick % TICK_RATE) / TICK_RATE) * Math.PI * 2
  tickHand
    .clear()
    .moveTo(0, 0)
    .lineTo(Math.sin(angle) * 8, -Math.cos(angle) * 8)
    .stroke({ width: 1, color: loop.hitstopMs > 0 ? 0xe23e4e : 0xf0c04a })

  box.tint = loop.hitstopMs > 0 ? 0xffffff : 0x8695ac

  const metrics: DebugMetrics = {
    fps,
    frameMs,
    logicMs,
    tick: loop.tick,
    ticksPerSecond,
    droppedTicks,
    alpha: stepped.alpha,
    hitstopMs: loop.hitstopMs,
    entities: 1,
    state: loop.hitstopMs > 0 ? 'hitstop' : 'idle',
  }
  overlay.render(metrics)
})

// --- 뷰포트 · 디버그 키 -------------------------------------------------------
function applyViewport(): void {
  const vp = computeViewport(window.innerWidth, window.innerHeight)
  app.canvas.style.width = `${vp.width}px`
  app.canvas.style.height = `${vp.height}px`
}
applyViewport()
window.addEventListener('resize', applyViewport)

window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') {
    e.preventDefault()
    overlay.toggle()
  }
})

console.info(
  `[grimhollow] 밸런스 로드 완료 — 무기 ${balance.weapons.length}, 적 ${balance.enemies.length}, 보스 ${balance.bosses.length}`,
)
