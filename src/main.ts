import { Application, Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_SECONDS } from './core/config.ts'
import { INITIAL_INPUT, advanceInput, isDown, type InputState } from './core/input.ts'
import { KeyboardSource } from './core/keyboard.ts'
import { INITIAL_LOOP, advance, requestHitstop, type LoopState } from './core/loop.ts'
import { computeViewport } from './core/viewport.ts'
import { loadBalance } from './data/load.ts'
import { STAGE_1 } from './data/stages/stage1.ts'
import { frameFor } from './entities/player/animation.ts'
import { emitsLight, isBlinking, isInvulnerable, pickUpRelic, spriteStateOf, takeHit } from './entities/player/vitals.ts'
import { bodyBox, coreBox, isCoreExposed, isWindingUp, slamBox } from './entities/bosses/cairn.ts'
import { boxOfEnemy } from './entities/enemies/enemy.ts'
import { NO_ABERRATION, pixelOffset, step as stepAberration, trigger as triggerAberration } from './fx/aberration.ts'
import { skeletonizeFrame } from './fx/dissolve.ts'
import { RELIC_LIGHT, limitLights, type Light } from './fx/light.ts'
import { ARMOR_BREAK_TIMING, DEATH_TIMING } from './fx/sequence.ts'
import { QUALITY_TIERS, createQuality, featuresFor, observeFps, setManual, type QualityState } from './fx/quality.ts'
import { createWorld, stepWorld, type DamageCause, type World } from './game/world.ts'
import { partsFor, paletteFor } from './sprite/armor.ts'
import { currentPose } from './sprite/clip.ts'
import { pose } from './sprite/pose.ts'
import { BreakDirector } from './render/breakDirector.ts'
import { BreakFx } from './render/breakFx.ts'
import { GreyboxRenderer } from './render/debug/greybox.ts'
import { ControlHint } from './render/debug/hint.ts'
import { DebugOverlay, type DebugMetrics } from './render/debug/overlay.ts'
import { BloomLayer } from './render/postfx/bloomLayer.ts'
import { LightLayer } from './render/postfx/lightLayer.ts'
import { ScreenFilter } from './render/postfx/screenFilter.ts'
import { ParallaxRenderer } from './render/parallax.ts'
import { S1_PALETTE } from './scenery/stage1.ts'
import { SpriteSheet, matrixToTexture } from './render/spriteTexture.ts'
import { HudRenderer } from './render/hudRenderer.ts'
import { Sfx } from './core/sfx.ts'
import {
  DUCK, INITIAL_MUSIC, duckMusic, gainsOf, silence, stepMusic, type MusicState,
} from './core/audio.ts'
import { INITIAL_HUD, stepHud, type HudState } from './ui/hud/hud.ts'
import { Playtest } from './ui/report/playtest.ts'

/**
 * 부트스트랩과 렌더.
 *
 * 게임 상태는 전부 `game/world.ts` 에 있다. 여기서는 그것을 읽어 그리기만 한다.
 * 로직을 그리기에서 떼어놓아야 테스트할 수 있다.
 *
 *   ← →  이동   Z 점프   X 던지기   ↓ 웅크리기   R 처음부터
 *   F1 오버레이 · F2 궤도/히트박스 · F3 성유물 · F4 피격 · F5 화질 · F6 게이트 판정
 */

TextureSource.defaultOptions.scaleMode = 'nearest'

const host = document.querySelector<HTMLElement>('#app')
if (!host) throw new Error('#app 이 없다')

const DEV = import.meta.env.DEV
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
  // 커스텀 셰이더를 GLSL 한 벌로 유지한다. → docs/10-tech-spec.md 10.1
  preference: 'webgl',
})

host.style.position = 'relative'
host.appendChild(app.canvas)

const overlay = new DebugOverlay(host)
overlay.setVisible(DEV)
const hint = new ControlHint(host, [
  '←  →   이동        Z   점프',
  'X  던지기         ↓   웅크리기        R  처음부터',
])
const keyboard = new KeyboardSource(window)

/**
 * 플레이테스트 계측.
 *
 * m1-gate 는 "추측하지 말고 계측한다"고 못박는다. 재시도율·시도 횟수·프레임
 * 유지율은 사람의 기억으로 잴 수 없으므로 빌드가 직접 센다.
 * 테스터에게는 지표를 보여주지 않는다 — 재는 걸 알면 행동이 달라진다.
 */
const playtest = new Playtest(host, keyboard)

// --- 층 구성 -------------------------------------------------------------------
// docs/06 6.2 의 8층. 배경(1~4)과 전경(7)은 카메라를 **부분적으로만** 따르므로
// stageRoot 안에 둘 수 없다. 셰이크는 같이 받아야 하니 shakeRoot 의 형제로 둔다.
const backdropRoot = new Container()  // 1~4 스카이 · 원경 · 중경 · 근경
const stageRoot = new Container()     // 5~6 게임플레이 타일 · 엔티티 — 카메라가 여기를 움직인다
const foregroundRoot = new Container() // 7 안개 · 오클루전
const shakeRoot = new Container()   // 셰이크가 여기를 흔든다
const fxLayer = new Container()
const lightLayer = new LightLayer()
const bloomLayer = new BloomLayer()
const screenFilter = new ScreenFilter()
const worldRoot = new Container()

shakeRoot.addChild(backdropRoot, stageRoot, foregroundRoot)
worldRoot.addChild(shakeRoot, lightLayer.output, bloomLayer.output, fxLayer)
worldRoot.filters = [screenFilter]
app.stage.addChild(worldRoot)

const parallax = new ParallaxRenderer(backdropRoot, foregroundRoot, bloomLayer.emissive)
const greybox = new GreyboxRenderer(stageRoot)
const enemyGfx = new Graphics()
const bossGfx = new Graphics()
stageRoot.addChild(enemyGfx, bossGfx)

const sheet = new SpriteSheet()
sheet.warmUp(['relic', 'steel', 'bare', 'bones'],
  ['idle', 'walk', 'jump', 'crouch', 'land', 'hurt', 'attack'], 'lance')

const lancel = new Sprite(sheet.frame('steel', 'idle', 0))
lancel.anchor.set(0.5, 1)
stageRoot.addChild(lancel)

const breakFx = new BreakFx(stageRoot, fxLayer)

/**
 * HUD 는 **화면 마감 필터 바깥**에 둔다.
 *
 * 비네트가 가장자리를 어둡게 하는데 HUD 는 위쪽 가장자리에 붙어 있다.
 * 필터 안에 두면 정보가 어두워지고, 그레인까지 얹혀 지저분해진다.
 * 카메라·셰이크와도 무관해야 한다 — 화면에 고정이다.
 */
const hudLayer = new Container()
app.stage.addChild(hudLayer)
const hudRenderer = new HudRenderer(hudLayer)
const sfx = new Sfx()
const director = new BreakDirector(20260825)

const relicGlow = new Sprite(Texture.WHITE)
relicGlow.anchor.set(0.5)
relicGlow.visible = false

/** 캐른의 코어. 스테이지 1 에서 유일한 고채도 광원이다. */
const coreGlow = new Sprite(Texture.WHITE)
coreGlow.anchor.set(0.5)
coreGlow.visible = false
bloomLayer.emissive.addChild(relicGlow, coreGlow)

// --- 상태 -----------------------------------------------------------------------
let world: World = createWorld(STAGE_1, balance)
let quality: QualityState = createQuality('high')
let aberration = NO_ABERRATION
let deathFlesh: readonly string[] | null = null
let showDebugBoxes = DEV
let hud: HudState = INITIAL_HUD
let music: MusicState = INITIAL_MUSIC
let score = 0
let elapsedTicks = 0
let bossSeen = false

greybox.drawGrid(world.map)
greybox.setGridVisible(showDebugBoxes)

function reset(): void {
  world = createWorld(STAGE_1, balance)
  hud = INITIAL_HUD
  music = INITIAL_MUSIC
  score = 0
  elapsedTicks = 0
  bossSeen = false
  director.reset()
  deathFlesh = null
  aberration = NO_ABERRATION
  breakFx.clear()
}

/** 갑옷 파괴·사망 연출을 건다. 파편은 깨진 갑옷의 실제 픽셀에서 나온다. */
function startBreak(brokenArmor: ReturnType<typeof spriteStateOf>, died: boolean): void {
  const brokenFrame = pose(partsFor(brokenArmor), currentPose(world.clip))
  const origin = {
    x: Math.round(world.player.body.x + world.player.body.width / 2) - 16,
    y: Math.round(world.player.body.y + world.player.body.height) + 1 - 32,
  }
  if (died) {
    deathFlesh = brokenFrame
    director.die(origin)
    loop = requestHitstop(loop, DEATH_TIMING.hitstopMs)
    return
  }
  director.breakArmor({ matrix: brokenFrame, armor: brokenArmor, origin })
  aberration = triggerAberration(aberration, 'armorBreak')
  loop = requestHitstop(loop, ARMOR_BREAK_TIMING.hitstopMs)
}

// --- 루프 -----------------------------------------------------------------------
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

  const polled = keyboard.poll()
  pendingFrame |= polled

  // 이 프레임 안에서 여러 틱이 돌 수 있다. 계측은 프레임 단위로 한 번 넘긴다.
  let diedThisFrame = false
  let hurtThisFrame = false
  let brokeThisFrame = false
  let causeThisFrame: DamageCause | null = null

  const stepped = advance(loop, frameMs)
  loop = stepped.state
  droppedTicks = stepped.droppedTicks

  const logicStart = performance.now()
  for (let i = 0; i < stepped.ticks; i += 1) {
    input = advanceInput(input, pendingFrame)
    if (input.held !== 0) { hint.dismiss(); sfx.unlock() }
    if (isDown(input.pressed, 'restart')) { reset(); break }

    const armorBefore = spriteStateOf(world.vitals)
    const result = stepWorld(world, input, balance)
    world = result.world
    input = result.input

    elapsedTicks += 1
    score += result.events.enemiesKilled * 200 + result.events.bossHit * 3

    if (result.events.hurt) hurtThisFrame = true
    if (result.events.died) diedThisFrame = true
    if (result.events.armorBroke) brokeThisFrame = true
    if (result.events.cause !== null) causeThisFrame = result.events.cause

    if (result.events.armorBroke || result.events.died) {
      startBreak(armorBefore, result.events.died)
      sfx.play(result.events.died ? 'death' : 'armorBreak')
      music = duckMusic(music, result.events.died ? DUCK.death : DUCK.armorBreak)
    }
    if (result.events.quake) {
      aberration = triggerAberration(aberration, 'sigil')
      sfx.play('quake')
    }
    if (result.events.fired) sfx.play('throw')
    if (result.events.landed) sfx.play('land')
    if (world.player.jumped) sfx.play('jump')
    if (result.events.enemiesKilled > 0) sfx.play('enemyDie')
    if (result.events.bossHit > 0) sfx.play('bossHit')

    // 보스 등장 — 0.3초 무음. 소리가 사라지면 사람은 화면을 본다.
    if (!bossSeen && world.cairn.awake) {
      bossSeen = true
      music = silence(music)
    }
  }
  logicMs = performance.now() - logicStart
  if (stepped.ticks > 0) pendingFrame = 0
  director.stepShards(balance.player.gravityFalling, (world.map.height - 1) * 16, TICK_SECONDS)

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

  // --- 연출 (히트스톱 중에도 흐른다) ---------------------------------------
  director.advance(frameMs)
  const shake = director.cameraOffset
  shakeRoot.position.set(shake.x, shake.y)
  stageRoot.position.set(-Math.round(world.camera.x), -Math.round(world.camera.y))
  // 발광 컨테이너의 내용물은 월드 좌표다. 씬에 그리지 않고 렌더 타겟에 바로
  // 굽기 때문에 카메라 이동을 여기서 직접 먹여야 위치가 맞는다.
  bloomLayer.emissive.position.copyFrom(stageRoot.position)

  const change = observeFps(quality, fps, frameMs)
  quality = change.state
  if (change.notify) console.info('[grimhollow] 프레임 유지를 위해 화질을 낮췄습니다')
  const features = featuresFor(quality.tier)

  aberration = stepAberration(aberration, frameMs)
  screenFilter.aberration = pixelOffset(aberration)
  screenFilter.grain = features.grain ? 0.03 : 0
  screenFilter.time = now / 1000

  // --- 그리기 ---------------------------------------------------------------
  parallax.update(world.camera.x, world.camera.y, now / 1000)
  greybox.drawTerrain(world.map, world.crumble)
  greybox.drawProjectiles(world.shots.projectiles)
  greybox.drawBodies(showDebugBoxes ? [world.player.body] : [])
  drawEnemies()
  drawBoss()

  const player = world.player
  lancel.texture = sheet.frame(
    spriteStateOf(world.vitals),
    world.clip.name,
    frameFor(player, world.clip),
    world.clip.name === 'attack' ? world.weaponId : undefined,
  )

  const skeleton = director.skeletonFrame
  if (deathFlesh && skeleton !== null) {
    lancel.texture = matrixToTexture(
      skeletonizeFrame(deathFlesh, pose(partsFor('bones'), currentPose(world.clip)), skeleton,
        DEATH_TIMING.skeletonizeFrames),
      paletteFor('bones'),
    )
  }

  lancel.visible = !isBlinking(world.vitals, balance.player)
  lancel.scale.x = player.facing
  lancel.x = Math.round(player.body.x + player.body.width / 2)
  lancel.y = Math.round(player.body.y + player.body.height) + 1

  breakFx.drawShards(director.shards, ARMOR_BREAK_TIMING.shardHoldMs)
  breakFx.drawFlash(lancel.texture, lancel.x, lancel.y, lancel.scale.x, director.flashAlpha)
  const ring = director.ring
  breakFx.drawRing(ring.x, ring.y, ring.radius, ring.alpha)
  breakFx.setInvert(director.consumeInvert())

  drawLighting(features, now)

  const secondsLeft = balance.player.stageTimeLimitSeconds - elapsedTicks / 60
  const busy = world.enemies.length > 0 || world.cairn.awake || isInvulnerable(world.vitals)
  hud = stepHud(hud, {
    vitals: world.vitals,
    weaponId: world.weaponId,
    secondsLeft,
    score,
    bossHp: world.cairn.awake && world.cairn.state !== 'dead' ? world.cairn.hp / 300 : null,
    busy,
  }, frameMs)
  hudRenderer.draw(hud, now)

  music = stepMusic(music, {
    armor: spriteStateOf(world.vitals),
    secondsLeft,
  }, frameMs)
  sfx.setVolume(0.6 * gainsOf(music).rhythm)

  overlay.render(metricsOf(frameMs))

  playtest.frame({
    frameMs,
    dead: world.vitals.dead,
    playerX: world.player.body.x,
    cleared: world.cleared,
    bossAwake: world.cairn.awake,
    pressed: polled !== 0,
    died: diedThisFrame,
    hurt: hurtThisFrame,
    armorBroke: brokeThisFrame,
    cause: causeThisFrame,
  })
})

function drawEnemies(): void {
  const g = enemyGfx.clear()
  const COLORS: Record<string, number> = { ghoul: 0x7a9660, grimm: 0xe23e4e, corvid: 0x5f6e85 }
  for (const enemy of world.enemies) {
    const box = boxOfEnemy(enemy)
    const color = enemy.hitFlash > 0 ? 0xffffff : (COLORS[enemy.kind] ?? 0xffffff)
    g.rect(Math.round(box.x), Math.round(box.y), box.width, box.height).fill(color)
    // 그림의 대기 상태는 눈에 띄어야 한다 — 화면 안에서 먼저 보여야 공정하다.
    if (enemy.kind === 'grimm' && enemy.state === 'dormant') {
      g.rect(Math.round(box.x) + 3, Math.round(box.y) + 3, 2, 2).fill(0xffd84a)
    }
  }
}

function drawBoss(): void {
  const g = bossGfx.clear()
  const cairn = world.cairn
  if (!cairn.awake || cairn.state === 'dead') return

  const body = bodyBox(cairn)
  // 예비 동작 중에는 실루엣이 달라져야 읽힌다.
  // 예비 동작 중에는 밝아진다. 실루엣 변화가 없으면 패턴을 읽을 수 없다.
  const tint = cairn.hitFlash > 0 ? 0xffffff : isWindingUp(cairn) ? 0xb9c6d8 : 0x6b7385
  g.rect(Math.round(body.x), Math.round(body.y), body.width, body.height).fill(tint)

  const core = coreBox(cairn)
  g.rect(Math.round(core.x), Math.round(core.y), core.width, core.height)
    .fill(isCoreExposed(cairn) ? 0xc9a6e8 : 0x8b4fd6)

  for (const fragment of cairn.fragments) {
    g.rect(Math.round(fragment.x), Math.round(fragment.y), 14, 14).fill(0x6b7385)
  }

  const slam = slamBox(cairn)
  if (slam) g.rect(Math.round(slam.x), Math.round(slam.y), slam.width, slam.height).fill(0xe23e4e)
}

function drawLighting(features: ReturnType<typeof featuresFor>, now: number): void {
  const player = world.player
  const cx = player.body.x + player.body.width / 2
  const cy = player.body.y + player.body.height / 2
  const lights: Light[] = []

  if (emitsLight(world.vitals) && world.vitals.relic) {
    const spec = RELIC_LIGHT[world.vitals.relic]
    lights.push({
      x: cx - world.camera.x, y: cy - world.camera.y,
      radius: spec.radius, color: spec.color, intensity: spec.intensity,
      flicker: { amplitude: 0.06, hz: 2.5 },
    })
  }
  // 캐른의 가슴 코어는 **항상** 빛난다. 약점이 곧 조명이므로,
  // 어두운 보스룸에서 플레이어는 빛을 따라가면 약점을 찾는다.
  // 분해 중에는 몸통이 사라져 더 밝게 드러난다.
  if (world.cairn.awake && world.cairn.state !== 'dead') {
    const core = coreBox(world.cairn)
    const exposed = isCoreExposed(world.cairn)
    lights.push({
      x: core.x + 5 - world.camera.x, y: core.y + 5 - world.camera.y,
      radius: exposed ? 110 : 76,
      color: 0xc9a6e8,
      intensity: exposed ? 1 : 0.75,
      flicker: { amplitude: exposed ? 0.15 : 0.08, hz: exposed ? 6 : 2 },
    })
  }

  lightLayer.setEnabled(features.dynamicLights)
  if (features.dynamicLights) {
    lightLayer.update(
      app.renderer,
      limitLights(lights, features.maxLights, { x: 0, y: 0 }),
      now,
      S1_PALETTE.ambient,
    )
  }

  relicGlow.visible = emitsLight(world.vitals)
  if (relicGlow.visible) {
    relicGlow.position.set(cx, cy)
    relicGlow.width = 20
    relicGlow.height = 28
    relicGlow.tint = world.vitals.relic ? RELIC_LIGHT[world.vitals.relic].color : 0xffffff
    relicGlow.alpha = 0.55
  }
  coreGlow.visible = world.cairn.awake && world.cairn.state !== 'dead'
  if (coreGlow.visible) {
    const core = coreBox(world.cairn)
    coreGlow.position.set(core.x + core.width / 2, core.y + core.height / 2)
    coreGlow.width = core.width + 6
    coreGlow.height = core.height + 6
    coreGlow.tint = 0xc9a6e8
    coreGlow.alpha = isCoreExposed(world.cairn) ? 0.95 : 0.7
  }

  bloomLayer.setEnabled(features.bloom)
  if (features.bloom) bloomLayer.update(app.renderer)
}

function metricsOf(frameMs: number): DebugMetrics {
  const cairn = world.cairn
  return {
    fps, frameMs, logicMs,
    tick: loop.tick, ticksPerSecond, droppedTicks,
    alpha: 0, hitstopMs: loop.hitstopMs,
    entities: world.enemies.length + world.shots.projectiles.length + 1,
    state: `${world.clip.name} · ${spriteStateOf(world.vitals)}`
      + `${isInvulnerable(world.vitals) ? ` inv${world.vitals.iFrames}` : ''} x${world.vitals.lives}`
      + `${cairn.awake ? ` · 캐른 ${cairn.hp} p${cairn.phase} ${cairn.state}` : ''}`
      + ` · ${quality.tier}${quality.manual ? '*' : ''}`,
    velocity: [world.player.body.vx, world.player.body.vy],
    coyoteFrames: world.player.timers.coyoteFrames,
    jumpBufferFrames: input.buffers.jump,
    grounded: world.player.body.onGround,
    shots: `${world.shots.projectiles.length}/2`,
  }
}

// --- 뷰포트 · 디버그 키 ----------------------------------------------------------
function applyViewport(): void {
  const vp = computeViewport(window.innerWidth, window.innerHeight)
  app.canvas.style.width = `${vp.width}px`
  app.canvas.style.height = `${vp.height}px`
}
applyViewport()
window.addEventListener('resize', applyViewport)

window.addEventListener('keydown', (e) => {
  if (e.key === 'F1') { e.preventDefault(); overlay.toggle() }
  if (e.key === 'F2') {
    e.preventDefault()
    showDebugBoxes = !showDebugBoxes
    greybox.setGridVisible(showDebugBoxes)
  }
  if (e.key === 'F3') {
    e.preventDefault()
    world = { ...world, vitals: pickUpRelic(world.vitals, 'gold', balance.player) }
  }
  if (e.key === 'F4') {
    e.preventDefault()
    const before = spriteStateOf(world.vitals)
    const result = takeHit(world.vitals, balance.player)
    if (!result.blocked) {
      world = { ...world, vitals: result.vitals }
      startBreak(before, result.died)
    }
  }
  if (e.key === 'F6') { e.preventDefault(); playtest.toggleGatePanel() }
  if (e.key === 'F5') {
    e.preventDefault()
    const next = QUALITY_TIERS[(QUALITY_TIERS.indexOf(quality.tier) + 1) % QUALITY_TIERS.length]
    quality = setManual(quality, next ?? 'medium')
  }
})

// 받은 바이트를 잰다. 늦게 붙는 자원까지 담으려면 로드 뒤에 한 번 더 봐야 한다.
playtest.measureLoad()
window.addEventListener('load', () => playtest.measureLoad())
setTimeout(() => playtest.measureLoad(), 3000)

if (DEV) {
  Object.assign(globalThis, {
    grimhollow: {
      app,
      sheet,
      playtest,
      snapshot: () => ({ tick: loop.tick, hitstopMs: loop.hitstopMs, input, world, quality, aberration, shards: director.shards }),
      warp: (tx: number) => {
        world = { ...world, player: { ...world.player, body: { ...world.player.body, x: tx * 16 } } }
      },
      reset,
      capture: async () => (await app.renderer.extract.base64(app.stage)) as string,
    },
  })
  console.info(`[grimhollow] ${STAGE_1.name} — ${world.map.width}x${world.map.height} 타일, 적 ${world.enemies.length}`)
}
