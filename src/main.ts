import { Application, Container, Sprite, TextureSource } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_SECONDS } from './core/config.ts'
import { INITIAL_INPUT, advanceInput, isDown, type InputState } from './core/input.ts'
import { KeyboardSource } from './core/keyboard.ts'
import { INITIAL_LOOP, advance, requestHitstop, type LoopState } from './core/loop.ts'
import { computeViewport } from './core/viewport.ts'
import { loadBalance, requireWeapon } from './data/load.ts'
import { simulateJumpArc } from './entities/player/arc.ts'
import { frameFor, nextClip } from './entities/player/animation.ts'
import { createPlayer, stepPlayer, type Player } from './entities/player/player.ts'
import {
  EMPTY_WORLD,
  countOf,
  spawnProjectile,
  stepProjectiles,
  type ProjectileWorld,
} from './entities/projectiles/projectile.ts'
import {
  INITIAL_CRUMBLE,
  resetCrumble,
  tickCrumble,
  touchCrumbling,
  type CrumbleState,
} from './physics/crumble.ts'
import { boxOf } from './physics/body.ts'
import { parseTilemap, type Tilemap } from './physics/tilemap.ts'
import {
  continueGame,
  createVitals,
  fallIntoPit,
  isBlinking,
  isGameOver,
  isInvulnerable,
  pickUpRelic,
  respawn,
  speedMultiplier,
  spriteStateOf,
  takeHit,
  tickVitals,
  type Vitals,
} from './entities/player/vitals.ts'
import { advanceClip, playClip, startClip, type ClipState } from './sprite/clip.ts'
import { SpriteSheet } from './render/spriteTexture.ts'
import { GreyboxRenderer } from './render/debug/greybox.ts'
import { ControlHint } from './render/debug/hint.ts'
import { DebugOverlay, type DebugMetrics } from './render/debug/overlay.ts'

/**
 * M0 캘리브레이션 빌드.
 *
 * 답할 질문은 하나다 — **점프가 재미있는가.**
 *
 *   ← →  이동      Z / Space  점프      X  공격(창)      ↓  웅크리기
 *   ↑/↓ + X 로 위아래 공격. F1 오버레이 · F2 궤도 표시 · R 리셋
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

/**
 * 계측 표시는 **개발 중에만** 기본으로 켠다.
 *
 * 테스터 빌드에서 궤도와 수치를 보여주면 그건 이미 설명이다.
 * 게이트에서 물을 것은 "점프가 재미있나요?" 하나뿐이다. → prompts/m0-gate.md
 */
const DEV = import.meta.env.DEV

const overlay = new DebugOverlay(host)
overlay.setVisible(DEV)

const hint = new ControlHint(host, [
  '←  →   이동        Z   점프',
  'X  던지기         ↓   웅크리기        R  처음부터',
])

const keyboard = new KeyboardSource(window)

/**
 * 캘리브레이션 레벨.
 *
 * 지면의 간격은 왼쪽부터 **2 · 3 · 4타일**이다. 실측 점프 거리는 62.3px(3.9타일)
 * 이지만 타일 격자에서 실제로 건널 수 있는 것은 3타일까지다 — 4타일 구덩이는
 * 넘지 못하는 것이 정상이고, 그것을 몸으로 확인하라고 넣었다.
 *
 * 구덩이 구간 위는 **일부러 비워 두었다.** 궤도 높이에 지형이 걸리면 그 옆면이
 * 벽으로 작동해 수평 속도를 죽인다 — 물리는 맞지만 캘리브레이션이 오염된다.
 * 원웨이 발판·천장 블록·붕괴 타일은 오른쪽 시험장에 모아 두었다.
 */
const LEVEL: Tilemap = parseTilemap([
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..........................###.',
  '..............................',
  '..............................',
  '.....................---......',
  '..............................',
  '..............................',
  '#####..###...####....#####xxxx',
])

const SPAWN = { x: 24, y: 200 }

const scene = new Container()
app.stage.addChild(scene)
const greybox = new GreyboxRenderer(scene)
greybox.drawGrid(LEVEL)

let map: Tilemap = LEVEL
let crumble: CrumbleState = INITIAL_CRUMBLE
let player: Player = createPlayer(SPAWN.x, SPAWN.y, balance.player)
let shots: ProjectileWorld = EMPTY_WORLD
let showArc = DEV

// --- 스프라이트 -----------------------------------------------------------------
const sheet = new SpriteSheet()
sheet.warmUp(['relic', 'steel', 'bare', 'bones'], ['idle', 'walk', 'jump', 'crouch', 'land', 'hurt'], 'lance')

const lancel = new Sprite(sheet.frame('steel', 'idle', 0))
// 앵커는 아래 가운데. 스프라이트 세로 중심선이 x16 이라 좌우 반전이 대칭이 된다.
lancel.anchor.set(0.5, 1)
scene.addChild(lancel)

let clip: ClipState = startClip('idle')
let vitals: Vitals = createVitals(balance.player)
/** 사망 후 부활까지 남은 틱. docs/09 — 사망에서 조작까지 3초 이내. */
let respawnTicks = 0
const RESPAWN_DELAY_TICKS = 90

/** M0 의 유일한 무기. 나머지 6종은 M2 다. */
const LANCE = requireWeapon(balance, 'lance')

greybox.drawTerrain(map, crumble)

/** 최고 속도로 뛰었을 때의 궤도. 매 틱 같으므로 한 번만 만든다. */
const ARC = simulateJumpArc(balance.player, { dt: TICK_SECONDS })

function reset(): void {
  map = LEVEL
  crumble = resetCrumble()
  player = createPlayer(SPAWN.x, SPAWN.y, balance.player)
  shots = EMPTY_WORLD
  clip = startClip('idle')
  vitals = createVitals(balance.player)
  respawnTicks = 0
}

/** 체크포인트 복귀. 맵과 붕괴 상태는 유지한다 — 스테이지를 처음부터 하지 않는다. */
function respawnPlayer(): void {
  player = createPlayer(SPAWN.x, SPAWN.y, balance.player)
  shots = EMPTY_WORLD
  clip = startClip('idle')
  vitals = respawn(vitals, balance.player)
}

/** 피격 한 번. 갑옷이 깨지면 180ms, 죽으면 250ms 멈춘다. → docs/06 6.5 */
function hurt(): void {
  const result = takeHit(vitals, balance.player)
  if (result.blocked) return

  vitals = result.vitals
  clip = startClip('hurt')
  loop = requestHitstop(loop, result.died ? 250 : 180)
  if (result.died) respawnTicks = RESPAWN_DELAY_TICKS
}

function stepWorld(input: InputState): InputState {
  const ticked = tickCrumble(crumble, map)
  map = ticked.map

  const stepped = stepPlayer(player, input, map, balance.player, TICK_SECONDS, {
    speedScale: speedMultiplier(vitals, balance.player),
  })
  player = stepped.player
  crumble = touchCrumbling(ticked.state, map, stepped.crumbled)

  shots = stepProjectiles(shots, map, TICK_SECONDS)
  if (player.attack.fired && player.attack.direction) {
    shots = spawnProjectile(shots, LANCE, {
      origin: boxOf(player.body),
      facing: player.facing,
      direction: player.attack.direction,
    })
  }

  // 낙사는 갑옷과 무관하게 즉사다. 성유물도 막지 못한다. → docs/02 2.5
  if (!vitals.dead && player.body.y > LOGICAL_HEIGHT) {
    vitals = fallIntoPit(vitals)
    loop = requestHitstop(loop, 250)
    respawnTicks = RESPAWN_DELAY_TICKS
  }

  vitals = tickVitals(vitals)

  if (vitals.dead) {
    respawnTicks -= 1
    if (respawnTicks <= 0) {
      if (isGameOver(vitals)) vitals = continueGame(balance.player).vitals
      respawnPlayer()
    }
  }

  clip = advanceClip(playClip(clip, nextClip(player, clip)), TICK_SECONDS * 1000)

  return stepped.input
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
    if (input.held !== 0) hint.dismiss()
    if (isDown(input.pressed, 'restart')) reset()
    input = stepWorld(input)
    // 발사 순간 아주 짧은 히트스톱. 던지는 손맛을 만드는 최소 장치다.
    if (player.attack.fired) loop = requestHitstop(loop, 40)
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

  greybox.drawTerrain(map, crumble)
  greybox.drawArc(
    showArc && player.body.onGround ? ARC : null,
    player.body.x + (player.facing === 1 ? player.body.width : 0),
    player.body.y,
    player.facing,
  )
  greybox.drawProjectiles(shots.projectiles)
  // 히트박스는 디버그에서만. 평소에는 스프라이트가 캐릭터를 대신한다.
  greybox.drawBodies(showArc ? [player.body] : [])

  lancel.texture = sheet.frame(
    spriteStateOf(vitals),
    clip.name,
    frameFor(player, clip),
    clip.name === 'attack' ? 'lance' : undefined,
  )
  // 무적 중 4프레임 주기 깜빡임. 갑옷 상태는 HUD 에 표시하지 않는다 —
  // 스프라이트가 곧 체력 바다. → docs/02 2.5
  lancel.visible = !isBlinking(vitals, balance.player)
  lancel.scale.x = player.facing
  lancel.x = Math.round(player.body.x + player.body.width / 2)
  lancel.y = Math.round(player.body.y + player.body.height) + 1

  const metrics: DebugMetrics = {
    fps,
    frameMs,
    logicMs,
    tick: loop.tick,
    ticksPerSecond,
    droppedTicks,
    alpha: stepped.alpha,
    hitstopMs: loop.hitstopMs,
    entities: 1 + shots.projectiles.length,
    state: `${player.state} · ${clip.name}[${frameFor(player, clip)}] · ${spriteStateOf(vitals)}`
      + `${isInvulnerable(vitals) ? ` inv${vitals.iFrames}` : ''} x${vitals.lives}`,
    velocity: [player.body.vx, player.body.vy],
    coyoteFrames: player.timers.coyoteFrames,
    jumpBufferFrames: input.buffers.jump,
    grounded: player.body.onGround,
    shots: `${countOf(shots, LANCE.id)}/${LANCE.maxOnScreen}`,
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
  if (e.key === 'F2') {
    e.preventDefault()
    showArc = !showArc
  }
  if (e.key === 'F3') {
    // 성유물 획득. 상자는 m1-5 다.
    e.preventDefault()
    vitals = pickUpRelic(vitals, 'gold', balance.player)
  }
  if (e.key === 'F4') {
    // 피격 한 대. 적은 m1-5 다.
    e.preventDefault()
    hurt()
  }
})

// --- 개발 핸들 ---------------------------------------------------------------
if (DEV) {
  Object.assign(globalThis, {
    grimhollow: {
      app,
      arc: ARC,
      reset,
      sheet,
      snapshot: () => ({
        clip,
        vitals,
        tick: loop.tick,
        hitstopMs: loop.hitstopMs,
        input,
        player,
        shots,
        map,
        crumble,
      }),
      capture: async () => (await app.renderer.extract.base64(app.stage)) as string,
    },
  })
}

if (DEV) {
  console.info(
    `[grimhollow] 점프 실측 — 높이 ${ARC.maxHeight.toFixed(1)}px · 거리 ${ARC.distance.toFixed(1)}px · 체공 ${ARC.airFrames}프레임`,
  )
}
