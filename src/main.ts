import {
  Application, BlurFilter, ColorMatrixFilter, Container, Graphics, Sprite, Texture, TextureSource,
} from 'pixi.js'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_SECONDS } from './core/config.ts'
import { INITIAL_INPUT, advanceInput, isDown, type InputState } from './core/input.ts'
import { KeyboardSource } from './core/keyboard.ts'
import { INITIAL_LOOP, advance, requestHitstop, type LoopState } from './core/loop.ts'
import { computeViewport } from './core/viewport.ts'
import { loadBalance } from './data/load.ts'
import { STAGE_1 } from './data/stages/stage1.ts'
import { frameFor } from './entities/player/animation.ts'
import { emitsLight, isBlinking, isInvulnerable, pickUpRelic, spriteStateOf, takeHit } from './entities/player/vitals.ts'
import { bodyBox, coreBox, isCoreExposed } from './entities/bosses/cairn.ts'
import { boxOfEnemy } from './entities/enemies/enemy.ts'
import { NO_ABERRATION, pixelOffset, step as stepAberration, trigger as triggerAberration } from './fx/aberration.ts'
import { skeletonizeFrame } from './fx/dissolve.ts'
import { RELIC_LIGHT, limitLights, type Light } from './fx/light.ts'
import { ARMOR_BREAK_TIMING, DEATH_TIMING } from './fx/sequence.ts'
import { QUALITY_TIERS, createQuality, featuresFor, observeFps, setManual, type QualityState } from './fx/quality.ts'
import { createWorld, stepWorld, type DamageCause, type World } from './game/world.ts'
import { sectionAt } from './game/stage.ts'
import {
  RUNNING, countdownNumber, isMenuOpen, isPlayable, pause as pauseGame,
  step as stepPause, toggle as togglePause, type PauseState,
} from './game/pause.ts'
import { buildResults, rollingAt, rollingDurationMs, type Results } from './game/results.ts'
import { createRun, stepRun, type RunStats } from './game/runStats.ts'
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
import { CairnRenderer } from './render/cairnRenderer.ts'
import { EnemyRenderer } from './render/enemyRenderer.ts'
import { ParallaxRenderer } from './render/parallax.ts'
import { S1_PALETTE } from './scenery/stage1.ts'
import { SpriteSheet, matrixToTexture } from './render/spriteTexture.ts'
import { HUD_BAR_HEIGHT, HudRenderer } from './render/hudRenderer.ts'
import { Sfx } from './core/sfx.ts'
import { Bgm } from './core/bgm.ts'
import {
  DUCK, INITIAL_MUSIC, duckMusic, silence, stepMusic, type MusicState,
} from './core/audio.ts'
import { INITIAL_HUD, stepHud, type HudState } from './ui/hud/hud.ts'
import { Playtest } from './ui/report/playtest.ts'
import { PauseMenu } from './ui/menus/pauseMenu.ts'
import { ResultsScreen } from './ui/menus/resultsScreen.ts'

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

/**
 * UI 타이밍 한 걸음의 상한 (ms).
 *
 * 브라우저가 멈췄다 돌아오면 첫 프레임 간격이 수 초가 된다. 그걸 그대로
 * 카운트다운·롤링에 먹이면 연출이 통째로 건너뛰어진다.
 */
const MAX_UI_STEP_MS = 100
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

const pauseMenu = new PauseMenu(host, {
  onResume: () => { pauseState = togglePause(pauseState) },
  onRestart: () => { reset() },
})

const resultsScreen = new ResultsScreen(host, {
  onSkip: () => { if (results) resultsElapsedMs = rollingDurationMs(results) },
  onContinue: () => {
    resultsScreen.close()
    // 보상이 먼저고 설문이 나중이다.
    playtest.promptSurvey()
  },
})

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
/**
 * 일시정지 배경 처리 — 블러 + 채도 40%. → docs/09 9.3
 *
 * 게임 화면을 그대로 두면 메뉴가 화면 위에 떠 있는 게 아니라 섞여 보인다.
 */
// 논리 해상도가 480×270 이라 강도를 조금만 올려도 화면이 통째로 뭉개진다.
// "게임 화면 유지" 가 요구사항이므로 알아볼 수 있는 선까지만 흐린다.
const pauseBlur = new BlurFilter({ strength: 2, quality: 2 })
const pauseDesaturate = new ColorMatrixFilter()
pauseDesaturate.saturate(-0.6, false)  // 채도 40% — docs/09 9.3
const worldRoot = new Container()

shakeRoot.addChild(backdropRoot, stageRoot, foregroundRoot)
worldRoot.addChild(shakeRoot, lightLayer.output, bloomLayer.output, fxLayer)
worldRoot.filters = [screenFilter]
app.stage.addChild(worldRoot)

// 나뭇가지는 HUD 바 아래에 건다. 위에 그리면 HUD 가 통째로 덮는다.
const parallax = new ParallaxRenderer(
  backdropRoot, foregroundRoot, bloomLayer.emissive, HUD_BAR_HEIGHT)
const greybox = new GreyboxRenderer(stageRoot)
const enemyGfx = new Graphics()
const bossGfx = new Graphics()
stageRoot.addChild(bossGfx)
const enemyRenderer = new EnemyRenderer(stageRoot)
const cairnRenderer = new CairnRenderer(stageRoot)
stageRoot.addChild(enemyGfx)

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
/**
 * BGM.
 *
 * 음원 파일이 없어 합성으로 낸다. 무음인 채로 "화려한가"를 물을 수 없다.
 * SFX 와 **같은 AudioContext** 를 쓴다 — 둘을 만들면 시계가 달라 어긋난다.
 * → docs/07-audio.md 7.2, prompts/m1-gate.md
 */
const bgm = new Bgm()
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
/**
 * 화질 기본값은 **보통**이다. → docs/06 6.9
 *
 * 처음 오는 사람의 기기를 모르므로 안전한 쪽에서 시작하고, 60fps 가 5초
 * 안정되면 자동으로 높음으로 올라간다. 높음에서 시작해 떨어뜨리면
 * 첫인상이 끊기는 화면이 된다.
 */
let quality: QualityState = createQuality('medium')
let aberration = NO_ABERRATION
let deathFlesh: readonly string[] | null = null
let showDebugBoxes = DEV
let hud: HudState = INITIAL_HUD
let music: MusicState = INITIAL_MUSIC
let elapsedTicks = 0
let bossSeen = false
let run: RunStats = createRun(STAGE_1.sections.length)
let pauseState: PauseState = RUNNING
/** 일시정지 키의 직전 상태. 누른 순간만 잡기 위한 것이다. */
let prevPauseDown = false
/** 지금 배경에 블러가 걸려 있는가. 필터 교체를 최소화한다. */
let blurred = false
let results: Results | null = null
let resultsElapsedMs = 0

greybox.drawGrid(world.map)
greybox.setGridVisible(showDebugBoxes)

function reset(): void {
  world = createWorld(STAGE_1, balance)
  hud = INITIAL_HUD
  music = INITIAL_MUSIC
  run = createRun(STAGE_1.sections.length)
  pauseState = RUNNING
  results = null
  resultsElapsedMs = 0
  resultsScreen.close()
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

  // --- 일시정지 -------------------------------------------------------------
  // 틱 밖에서 본다. 멈춰 있으면 틱이 안 도는데 그 안에서 입력을 읽으면
  // 다시 켤 방법이 없어진다. 누른 순간만 잡아야 하므로 직전 상태와 비교한다.
  const pauseDown = isDown(polled, 'pause')
  const menuBusy = resultsScreen.isOpen || playtest.surveyOpen
  if (pauseDown && !prevPauseDown && !menuBusy) {
    pauseState = togglePause(pauseState)
    sfx.play('menu')
  }
  prevPauseDown = pauseDown
  // 프레임 간격을 그대로 넣으면 안 된다. 탭에서 돌아온 첫 프레임은 수 초짜리라
  // 3-2-1 이 한 프레임에 다 소진된다 — 손을 올리기 전에 게임이 시작된다.
  pauseState = stepPause(pauseState, Math.min(frameMs, MAX_UI_STEP_MS))

  const playable = isPlayable(pauseState) && !menuBusy
  const menuOpen = isMenuOpen(pauseState)
  pauseMenu.render(menuOpen, countdownNumber(pauseState))
  // 필터 배열은 바뀔 때만 갈아 끼운다. 매 프레임 새로 넣으면 파이프라인을 다시 만든다.
  if (menuOpen !== blurred) {
    blurred = menuOpen
    worldRoot.filters = menuOpen
      ? [screenFilter, pauseBlur, pauseDesaturate]
      : [screenFilter]
  }

  // 이 프레임 안에서 여러 틱이 돌 수 있다. 계측은 프레임 단위로 한 번 넘긴다.
  let diedThisFrame = false
  let hurtThisFrame = false
  let brokeThisFrame = false
  let respawnedThisFrame = false
  let causeThisFrame: DamageCause | null = null

  // 멈춰 있으면 시간을 누산하지 않는다. 누산하면 풀리는 순간 밀린 틱이 쏟아진다.
  const stepped = playable
    ? advance(loop, frameMs)
    : { state: loop, ticks: 0, droppedTicks: 0, alpha: 0, hitstopped: false }
  loop = stepped.state
  droppedTicks = stepped.droppedTicks

  const logicStart = performance.now()
  for (let i = 0; i < stepped.ticks; i += 1) {
    input = advanceInput(input, pendingFrame)
    if (input.held !== 0) { hint.dismiss(); sfx.unlock() }
    if (isDown(input.pressed, 'restart')) { reset(); break }

    const armorBefore = spriteStateOf(world.vitals)
    const deadBefore = world.vitals.dead
    const result = stepWorld(world, input, balance)
    world = result.world
    input = result.input
    // 부활은 틱 단위로 본다. 프레임 앞뒤만 비교하면, 부활한 틱과 다시 죽은 틱이
    // 같은 프레임에 들어올 때 조작 복귀가 통째로 안 보인다.
    if (deadBefore && !world.vitals.dead) respawnedThisFrame = true

    elapsedTicks += 1
    run = stepRun(run, {
      events: result.events,
      sectionIndex: sectionAt(STAGE_1, world.player.body.x),
      armor: spriteStateOf(world.vitals),
    })

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
    // 그림 이륙음. 이 소리가 들리면 즉시 위치를 확인하게 만드는 것이 목표다.
    // → docs/07 7.5
    if (result.events.grimmTookOff) sfx.play('grimmTakeoff')
    if (result.events.bossKilled) sfx.play('clear')

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

  // --- 연출 (히트스톱 중에도 흐른다. 일시정지에는 멈춘다) -------------------
  director.advance(playable ? frameMs : 0)
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
    score: run.score,
    bossHp: world.cairn.awake && world.cairn.state !== 'dead' ? world.cairn.hp / 300 : null,
    busy,
  }, frameMs)
  hudRenderer.draw(hud, now)

  music = stepMusic(music, {
    armor: spriteStateOf(world.vitals),
    secondsLeft,
  }, frameMs)
  // 첫 입력에서 컨텍스트가 깨어난 뒤에야 붙는다. 이미 붙었으면 아무 일도 안 한다.
  bgm.attach(sfx.context)
  bgm.update(music)

  overlay.render(metricsOf(frameMs))

  // --- 결과 화면 -----------------------------------------------------------
  if (world.cleared && results === null) {
    results = buildResults(run, {
      secondsLeft: balance.player.stageTimeLimitSeconds - elapsedTicks / 60,
      enemyTotal: STAGE_1.enemies.length,
    })
    resultsElapsedMs = 0
    resultsScreen.open(STAGE_1.name)
  }
  if (results !== null && resultsScreen.isOpen) {
    resultsElapsedMs += Math.min(frameMs, MAX_UI_STEP_MS)
    resultsScreen.render(results, rollingAt(results, resultsElapsedMs))
  }

  // 멈춰 있는 동안은 플레이 시간이 아니다. 프레임도 지표도 세지 않는다.
  if (!playable) return

  playtest.frame({
    frameMs,
    dead: world.vitals.dead,
    playerX: world.player.body.x,
    cleared: world.cleared,
    bossAwake: world.cairn.awake,
    pressed: polled !== 0,
    respawned: respawnedThisFrame,
    died: diedThisFrame,
    hurt: hurtThisFrame,
    armorBroke: brokeThisFrame,
    cause: causeThisFrame,
  })
})

function drawEnemies(): void {
  enemyRenderer.draw(world.enemies, loop.tick)
  // 히트박스는 디버그에서만 겹쳐 그린다. 스프라이트와 판정이 어긋나면 여기서 보인다.
  const g = enemyGfx.clear()
  if (!showDebugBoxes) return
  for (const enemy of world.enemies) {
    const box = boxOfEnemy(enemy)
    g.rect(Math.round(box.x), Math.round(box.y), box.width, box.height)
      .stroke({ width: 1, color: 0xe23e4e })
  }
}

function drawBoss(): void {
  cairnRenderer.draw(world.cairn, loop.tick)

  // 히트박스는 디버그에서만. 파편 4개는 각각 판정 단위라 눈으로 확인할 수 있어야 한다.
  const g = bossGfx.clear()
  if (!showDebugBoxes || !world.cairn.awake) return
  const body = bodyBox(world.cairn)
  g.rect(Math.round(body.x), Math.round(body.y), body.width, body.height)
    .stroke({ width: 1, color: 0x8695ac })
  const core = coreBox(world.cairn)
  g.rect(Math.round(core.x), Math.round(core.y), core.width, core.height)
    .stroke({ width: 1, color: 0xc9a6e8 })
  for (const fragment of world.cairn.fragments) {
    g.rect(Math.round(fragment.x), Math.round(fragment.y), 14, 14)
      .stroke({ width: 1, color: 0xe23e4e })
  }
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

// 탭을 벗어나면 저절로 멈춘다. → docs/09 9.7
// 없으면 자리를 뜬 사이에 죽고, 그 죽음이 계측에서 "이탈" 로 잡힌다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pauseState = pauseGame(pauseState)
})

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
