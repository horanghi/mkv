import { Application, Container, TextureSource } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_SECONDS } from './core/config.ts'
import { INITIAL_INPUT, advanceInput, isDown, type InputState } from './core/input.ts'
import { KeyboardSource } from './core/keyboard.ts'
import { INITIAL_LOOP, advance, requestHitstop, type LoopState } from './core/loop.ts'
import { computeViewport } from './core/viewport.ts'
import { loadBalance } from './data/load.ts'
import { createBody, resolve, type Body } from './physics/body.ts'
import { INITIAL_CRUMBLE, resetCrumble, tickCrumble, touchCrumbling, type CrumbleState } from './physics/crumble.ts'
import { parseTilemap, type Tilemap } from './physics/tilemap.ts'
import { DebugOverlay, type DebugMetrics } from './render/debug/overlay.ts'
import { GreyboxRenderer } from './render/debug/greybox.ts'

/**
 * 부트스트랩 + 그레이박스 충돌 시연.
 *
 * 플레이어 조작은 없다 — m0-4 다. 여기 도는 네 개의 프로브는 m0-3 의 "Done" 조건을
 * 눈으로 확인하기 위한 것이고, 조작이 들어오면 지운다.
 *
 *   낙하    지면 위에 정확히 멈추는가
 *   발판    아래에서 통과하고 위에서 밟히는가
 *   탄환    한 틱에 6타일을 가도 벽을 뚫지 않는가
 *   붕괴    밟은 뒤 1초에 무너지는가
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

// --- 그레이박스 레벨 ----------------------------------------------------------
const LEVEL: Tilemap = parseTilemap([
  '..............................',
  '..............................',
  '..............................',
  '.....-----....................',
  '..............................',
  '..............................',
  '..............................',
  '.................xxxx.........',
  '..............................',
  '..............................',
  '..........................####',
  '..........................####',
  '..........................####',
  '............^^^^..............',
  '..............................',
  '..............................',
  '##############################',
])

const scene = new Container()
app.stage.addChild(scene)
const greybox = new GreyboxRenderer(scene)
greybox.drawGrid(LEVEL)

let map: Tilemap = LEVEL
let crumble: CrumbleState = INITIAL_CRUMBLE

// 첫 틱 전에도 지형이 보이게 한 번 그려둔다.
greybox.drawTerrain(map, crumble)

// --- 프로브 -------------------------------------------------------------------
type ProbeKind = 'fall' | 'platform' | 'bullet' | 'crumble'

interface Probe {
  readonly kind: ProbeKind
  body: Body
  /** 재시작까지 남은 틱. 0 이면 굴러가는 중이다. */
  wait: number
}

const SPAWN: Readonly<Record<ProbeKind, () => Body>> = {
  fall: () => createBody(40, 8, 12, 26),
  platform: () => createBody(104, 40, 12, 26, { vy: balance.player.jumpVelocity }),
  bullet: () => createBody(0, 176, 4, 4, { vx: 6000 }),
  crumble: () => createBody(280, 8, 12, 26),
}

const probes: Probe[] = (['fall', 'platform', 'bullet', 'crumble'] as const).map((kind) => ({
  kind,
  body: SPAWN[kind](),
  wait: 0,
}))

function stepProbes(): void {
  const p = balance.player
  const touched: { tx: number; ty: number }[] = []

  for (const probe of probes) {
    if (probe.wait > 0) {
      probe.wait -= 1
      if (probe.wait === 0) restart(probe)
      continue
    }

    // 탄환만 중력을 받지 않는다 — 수평 터널링만 보기 위한 것이다.
    if (probe.kind !== 'bullet') {
      const gravity = probe.body.vy < 0 ? p.gravityRising : p.gravityFalling
      const vy = Math.min(p.maxFallSpeed, probe.body.vy + gravity * TICK_SECONDS)
      probe.body = { ...probe.body, vy }
    }

    const result = resolve(probe.body, map, TICK_SECONDS)
    probe.body = result.body
    touched.push(...result.crumbled)

    if (isFinished(probe)) probe.wait = 90
  }

  // 타이머를 먼저 돌리고 이번 틱의 접촉을 등록한다 — 순서가 바뀌면 1틱 빨리 무너진다.
  const ticked = tickCrumble(crumble, map)
  map = ticked.map
  crumble = touchCrumbling(ticked.state, map, touched)
}

function isFinished(probe: Probe): boolean {
  if (probe.kind === 'bullet') return probe.body.hitWall
  if (probe.body.y > LOGICAL_HEIGHT) return true
  return probe.body.onGround
}

function restart(probe: Probe): void {
  probe.body = SPAWN[probe.kind]()
  if (probe.kind === 'crumble') {
    // 무너진 발판을 되돌려 시연을 반복한다. 게임 규칙이 아니라 시연 장치다.
    map = LEVEL
    crumble = resetCrumble()
  }
}

// --- 루프 ---------------------------------------------------------------------
let loop: LoopState = INITIAL_LOOP
let input: InputState = INITIAL_INPUT
let pendingFrame = 0

let lastFrameAt = performance.now()
let logicMs = 0
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
    input = advanceInput(input, pendingFrame)
    if (isDown(input.pressed, 'attack')) loop = requestHitstop(loop, 180)
    stepProbes()
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
  greybox.drawTerrain(map, crumble)
  greybox.drawBodies(probes.filter((p) => p.wait === 0).map((p) => p.body))

  const metrics: DebugMetrics = {
    fps,
    frameMs,
    logicMs,
    tick: loop.tick,
    ticksPerSecond,
    droppedTicks,
    alpha: stepped.alpha,
    hitstopMs: loop.hitstopMs,
    entities: probes.filter((p) => p.wait === 0).length,
    state: loop.hitstopMs > 0 ? 'hitstop' : 'probes',
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

// --- 개발 핸들 ---------------------------------------------------------------
// 콘솔에서 상태를 들여다보고 화면을 뽑아낼 수 있게 한다. 프로덕션 번들에서는 사라진다.
// 스테이지 워프·프리 카메라(docs/10-tech-spec.md 10.10)도 여기에 붙는다.
if (import.meta.env.DEV) {
  Object.assign(globalThis, {
    grimhollow: {
      app,
      probes,
      snapshot: () => ({ tick: loop.tick, hitstopMs: loop.hitstopMs, map, crumble }),
      capture: async () => (await app.renderer.extract.base64(app.stage)) as string,
    },
  })
}

console.info(
  `[grimhollow] 밸런스 로드 완료 — 무기 ${balance.weapons.length}, 적 ${balance.enemies.length}, 보스 ${balance.bosses.length}`,
)
