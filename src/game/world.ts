import { TICK_SECONDS } from '../core/config.ts'
import { createRng, nextFloat, type RngState } from '../core/rng.ts'
import type { InputState } from '../core/input.ts'
import type { Balance } from '../data/load.ts'
import { requireWeapon } from '../data/load.ts'
import {
  awaken, damageCairn, createCairn, fragmentBoxes, slamBox, stepCairn, bodyBox,
  type Cairn,
} from '../entities/bosses/cairn.ts'
import {
  EMPTY_HAZARDS, boxOfHazard, clearHazards, spawnHazard, stepHazards,
  type HazardWorld,
} from '../entities/bosses/hazard.ts'
import {
  createChest, stepChest, strikeChest, takeChest, type Chest,
} from '../entities/pickups/chest.ts'
import {
  boxOfEnemy, createEnemy, damage, pruneEnemies, tickFlash, touches,
  type Enemy, type EnemyKind,
} from '../entities/enemies/enemy.ts'
import { stepCorvid } from '../entities/enemies/corvid.ts'
import { stepGhoul, isVulnerable } from '../entities/enemies/ghoul.ts'
import { stepGrimm } from '../entities/enemies/grimm.ts'
import { nextClip } from '../entities/player/animation.ts'
import { createPlayer, stepPlayer, type Player } from '../entities/player/player.ts'
import {
  createVitals, fallIntoPit, pickUpRelic, respawn, speedMultiplier, takeHit, tickVitals,
  isInvulnerable, isGameOver, continueGame, type Vitals,
} from '../entities/player/vitals.ts'
import {
  EMPTY_WORLD, boxOfProjectile, spawnProjectile, stepProjectiles,
  type Projectile, type ProjectileWorld,
} from '../entities/projectiles/projectile.ts'
import { overlaps } from '../physics/aabb.ts'
import { boxOf } from '../physics/body.ts'
import {
  INITIAL_CRUMBLE, resetCrumble, tickCrumble, touchCrumbling, type CrumbleState,
} from '../physics/crumble.ts'
import type { Tilemap } from '../physics/tilemap.ts'
import { advanceClip, playClip, startClip, releasesProjectile, type ClipState } from '../sprite/clip.ts'
import { snapCamera, stepCamera, viewOf, type Camera } from './camera.ts'
import { lastCheckpoint, type Stage } from './stage.ts'

/**
 * 월드 — 스테이지 하나의 살아 있는 상태 전부.
 *
 * 렌더와 분리되어 있다. 여기서는 그리지 않고, `main.ts` 는 여기 상태를 읽어
 * 그리기만 한다. 그래야 로직을 테스트할 수 있다.
 */

export interface World {
  readonly stage: Stage
  readonly map: Tilemap
  readonly crumble: CrumbleState
  readonly player: Player
  readonly vitals: Vitals
  readonly clip: ClipState
  readonly shots: ProjectileWorld
  readonly enemies: readonly Enemy[]
  readonly cairn: Cairn
  /** 보스가 내보낸 위험물 — 묘비·낙석. 플레이어를 때린다 */
  readonly hazards: HazardWorld
  /** 보물상자. 무기와 성유물의 유일한 획득 경로다 */
  readonly chests: readonly Chest[]
  readonly camera: Camera
  readonly weaponId: string
  readonly rng: RngState
  readonly nextEnemyId: number
  /** 사망 후 부활까지 남은 틱 */
  readonly respawnTicks: number
  /**
   * 이번 시도의 경과 틱. 제한 시간을 재는 시계다.
   *
   * 시간 초과는 잔기 1 을 먹고 체크포인트에서 다시 시작한다 (docs/02 2.8).
   * **다시 시작할 때 0 으로 돌아간다** — 안 그러면 부활하자마자 또 끊긴다.
   */
  readonly elapsedTicks: number
  readonly cleared: boolean
  /**
   * 잔기를 다 썼다. 플레이어가 고를 때까지 멈춘다.
   *
   * **잔기가 남아 있으면 절대 참이 되지 않는다** — 어떤 UI 도 끼어들지 않는다.
   * → docs/09 9.3
   */
  readonly gameOver: boolean
}

/**
 * 무엇에 맞았는가.
 *
 * m1-gate 의 "무엇에 죽었는지 모름" 진단에 필요하다. 사인을 모으지 않으면
 * 재시도율이 낮을 때 난이도를 낮추는 것 말고 할 수 있는 게 없다.
 * → prompts/m1-gate.md
 */
export type DamageCause = EnemyKind | 'cairn' | 'pit' | 'timeout'

/** 이번 틱에 일어난 일. 연출과 소리가 여기에 반응한다. */
export interface WorldEvents {
  readonly armorBroke: boolean
  readonly died: boolean
  readonly hurt: boolean
  readonly enemiesKilled: number
  readonly bossHit: number
  readonly bossKilled: boolean
  readonly quake: boolean
  readonly fired: boolean
  readonly landed: boolean
  /** 그림이 대기에서 풀려 날아오르기 시작했다 */
  readonly grimmTookOff: boolean
  /** 이번 틱에 상자를 열었다 */
  readonly chestOpened: boolean
  /** 이번 틱에 주운 것. 없으면 null */
  readonly pickedUp: 'weapon' | 'relic' | null
  /** 이번 틱에 잔기를 다 썼다. 한 번만 뜬다 */
  readonly gameOver: boolean
  /** `hurt` 또는 `died` 일 때만 채워진다. */
  readonly cause: DamageCause | null
}

const NO_EVENTS: WorldEvents = Object.freeze({
  armorBroke: false, died: false, hurt: false, enemiesKilled: 0,
  bossHit: 0, bossKilled: false, quake: false, fired: false, landed: false,
  grimmTookOff: false, chestOpened: false, pickedUp: null, gameOver: false, cause: null,
})

/**
 * 이번 틱에 플레이어를 때린 것.
 *
 * 순서가 곧 우선순위다. 적과 보스에 동시에 닿을 수 있는데, 그럴 때 보스로
 * 기록해야 보스룸 사망이 잡몹 사망으로 새지 않는다.
 */
function causeOfHit(
  enemies: readonly Enemy[],
  cairn: Cairn,
  hazards: HazardWorld,
  playerBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): DamageCause | null {
  const slam = slamBox(cairn)
  const byCairn = fragmentBoxes(cairn).some((b) => overlaps(b, playerBox))
    || (slam !== null && overlaps(slam, playerBox))
    || (cairn.awake && cairn.state !== 'dead' && overlaps(bodyBox(cairn), playerBox))
    || hazards.hazards.some((h) => overlaps(boxOfHazard(h), playerBox))
  if (byCairn) return 'cairn'

  const hit = enemies.find((e) => touches(e, playerBox) && isVulnerable(e))
  return hit ? hit.kind : null
}

/** 사망에서 조작까지 3초 예산. 연출 1.25초 + 여유. → docs/02 2.6 */
export const RESPAWN_DELAY_TICKS = 90

export function createWorld(stage: Stage, balance: Balance, seed = 20260825): World {
  const size = stage.map.tileSize
  let rng = createRng(seed)
  let id = 1

  const enemies = stage.enemies.map((spawn) => {
    const draw = nextFloat(rng)
    rng = draw.state
    return createEnemy(
      id++, spawn.kind, spawn.tx * size, spawn.ty * size,
      createRng(Math.floor(draw.value * 1e9) + 1), spawn.state, spawn.facing,
    )
  })

  const player = createPlayer(stage.spawn.tx * size, stage.spawn.ty * size, balance.player)
  const bossX = stage.bossGateX + 120

  return {
    stage,
    map: stage.map,
    crumble: INITIAL_CRUMBLE,
    player,
    vitals: createVitals(balance.player),
    clip: startClip('idle'),
    shots: EMPTY_WORLD,
    enemies,
    cairn: createCairn(bossX, (stage.map.height - 1) * size - 52, createRng(seed + 7)),
    hazards: EMPTY_HAZARDS,
    chests: stage.chests.map((spawn, i) =>
      createChest(i + 1, spawn.tx, spawn.ty, spawn.contents, size)),
    camera: snapCamera({ x: player.body.x, y: player.body.y, facing: 0, falling: false },
      boundsOf(stage)),
    weaponId: 'lance',
    rng,
    nextEnemyId: id,
    respawnTicks: 0,
    elapsedTicks: 0,
    cleared: false,
    gameOver: false,
  }
}

export function boundsOf(stage: Stage): { readonly width: number; readonly height: number } {
  return {
    width: stage.map.width * stage.map.tileSize,
    height: stage.map.height * stage.map.tileSize,
  }
}

export interface WorldStep {
  readonly world: World
  readonly input: InputState
  readonly events: WorldEvents
}

/**
 * 한 로직 틱.
 *
 * 순서가 규칙이다. 지형 → 플레이어 → 적 → 투사체 → 판정 → 카메라.
 * 판정을 이동보다 먼저 하면 한 프레임 늦은 위치로 맞는다.
 */
export function stepWorld(world: World, input: InputState, balance: Balance): WorldStep {
  const dt = TICK_SECONDS
  let events = { ...NO_EVENTS }

  // 죽어 있는 동안은 부활 카운트만 돈다.
  if (world.vitals.dead) return stepDead(world, input, balance)

  // --- 지형 -----------------------------------------------------------------
  const ticked = tickCrumble(world.crumble, world.map)
  let map = ticked.map

  // --- 플레이어 -------------------------------------------------------------
  const stepped = stepPlayer(world.player, input, map, balance.player, dt, {
    speedScale: speedMultiplier(world.vitals, balance.player),
  })
  const player = stepped.player
  const crumble = touchCrumbling(ticked.state, map, stepped.crumbled)
  let nextInput = stepped.input
  if (player.landed) events = { ...events, landed: true }

  // --- 적 -------------------------------------------------------------------
  const playerBox = boxOf(player.body)
  const target = { x: playerBox.x + playerBox.width / 2, y: playerBox.y + playerBox.height / 2 }
  const view = viewOf(world.camera)

  let grimmTookOff = false
  let enemies = world.enemies.map((enemy) => {
    const alive = tickFlash(enemy)
    switch (alive.kind) {
      case 'ghoul': return stepGhoul(alive, map, balance.player.gravityFalling, dt)
      case 'grimm': {
        const next = stepGrimm(alive, map, { target, view }, balance.player.gravityFalling, dt)
        // 대기에서 풀리는 순간. 소리로 알려야 위치를 확인할 시간이 생긴다.
        // → docs/07 7.5 "그림 이륙음은 고유하고 날카롭게"
        if (alive.state === 'dormant' && next.state !== 'dormant') grimmTookOff = true
        return next
      }
      default: return stepCorvid(alive, map, target, dt)
    }
  })
  if (grimmTookOff) events = { ...events, grimmTookOff: true }

  // --- 보스 -----------------------------------------------------------------
  let cairn = world.cairn
  if (!cairn.awake && player.body.x >= world.stage.bossGateX) cairn = awaken(cairn)
  const bossStep = stepCairn(cairn, { target, groundY: (map.height - 1) * map.tileSize }, dt)
  cairn = bossStep.cairn
  if (bossStep.emission.quake) events = { ...events, quake: true }

  // 묘비와 낙석. 이걸 받지 않으면 두 패턴이 예비 동작만 하고 아무 일도 안 한다.
  let hazards = world.hazards
  for (const spawn of bossStep.emission.gravestones) {
    hazards = spawnHazard(hazards, 'gravestone', spawn)
  }
  for (const spawn of bossStep.emission.rocks) {
    hazards = spawnHazard(hazards, 'rock', spawn)
  }
  hazards = stepHazards(hazards, map, balance.player.gravityFalling, dt)

  let rng = world.rng
  let nextEnemyId = world.nextEnemyId
  for (const spawn of bossStep.emission.ghouls) {
    const draw = nextFloat(rng)
    rng = draw.state
    enemies = [...enemies,
      createEnemy(nextEnemyId++, 'ghoul', spawn.x, spawn.y, createRng(Math.floor(draw.value * 1e9) + 1))]
  }

  // --- 투사체 ---------------------------------------------------------------
  let shots = stepProjectiles(world.shots, map, dt)
  const weapon = requireWeapon(balance, world.weaponId)
  if (releasesProjectile(world.clip) && player.attack.direction) {
    shots = spawnProjectile(shots, weapon, {
      origin: playerBox, facing: player.facing, direction: player.attack.direction,
    })
    events = { ...events, fired: true }
  }

  // --- 투사체 ↔ 적 ----------------------------------------------------------
  const survivors: Projectile[] = []
  let killed = 0
  let bossHit = 0
  let bossKilled = false
  let chests = world.chests.map(stepChest)
  let chestOpened = false

  for (const shot of shots.projectiles) {
    const box = boxOfProjectile(shot)
    let consumed = false

    enemies = enemies.map((enemy) => {
      if (consumed || enemy.dead || !isVulnerable(enemy)) return enemy
      if (!overlaps(box, boxOfEnemy(enemy))) return enemy
      consumed = true
      const result = damage(enemy, shot.damage)
      if (result.killed) killed += 1
      return result.enemy
    })

    if (!consumed && cairn.awake && cairn.state !== 'dead') {
      const result = damageCairn(cairn, shot.damage, box)
      if (result.dealt > 0) {
        cairn = result.cairn
        bossHit += result.dealt
        bossKilled = bossKilled || result.killed
        consumed = true
      }
    }
    // 상자는 때려야 열린다. 투사체는 그대로 살아남는다 — 상자에 막혀
    // 뒤의 적을 못 때리면 "때려서 열기" 가 벌칙이 된다.
    if (!consumed) {
      chests = chests.map((chest) => {
        const struck = strikeChest(chest, box)
        if (struck !== chest) chestOpened = true
        return struck
      })
    }

    if (!consumed) survivors.push(shot)
  }
  shots = { ...shots, projectiles: survivors }
  events = { ...events, enemiesKilled: killed, bossHit, bossKilled, chestOpened }

  // --- 줍기 -----------------------------------------------------------------
  let weaponId = world.weaponId
  let pickedVitals = world.vitals
  let pickedUp: 'weapon' | 'relic' | null = null
  chests = chests.map((chest) => {
    const result = takeChest(chest, playerBox)
    if (result.taken === null) return chest
    if (result.taken.kind === 'weapon') {
      weaponId = result.taken.weaponId
      pickedUp = 'weapon'
    } else {
      pickedVitals = pickUpRelic(pickedVitals, result.taken.relic, balance.player)
      pickedUp = 'relic'
    }
    return result.chest
  })
  if (pickedUp !== null) events = { ...events, pickedUp }

  // --- 피격 -----------------------------------------------------------------
  let vitals = tickVitals(pickedVitals)
  if (!isInvulnerable(vitals)) {
    const cause = causeOfHit(enemies, cairn, hazards, playerBox)

    if (cause !== null) {
      const result = takeHit(vitals, balance.player)
      vitals = result.vitals
      events = { ...events, hurt: true, armorBroke: result.broke, died: result.died, cause }
    }
  }

  // 낙사는 갑옷과 무관하게 즉사다.
  const fellOut = player.body.y > (map.height + 2) * map.tileSize
  if (fellOut && !vitals.dead) {
    vitals = fallIntoPit(vitals)
    events = { ...events, died: true, cause: 'pit' }
  }

  // 시간 초과 — 잔기 1 을 먹고 체크포인트에서 다시 시작한다. → docs/02 2.8
  //
  // 낙사와 같은 처리다. 갑옷이 남았든 아니든 시간은 봐주지 않는다.
  // 30초 전부터 시계가 붉게 뛰고 BGM 이 빨라지므로 예고 없는 죽음은 아니다.
  const elapsedTicks = world.elapsedTicks + 1
  const limitTicks = Math.round(balance.player.stageTimeLimitSeconds * 60)
  if (!vitals.dead && !world.cleared && elapsedTicks >= limitTicks) {
    vitals = fallIntoPit(vitals)
    events = { ...events, died: true, cause: 'timeout' }
  }

  // --- 애니메이션 · 카메라 --------------------------------------------------
  const wanted = events.hurt ? 'hurt' : nextClip(player, world.clip)
  const clip = advanceClip(
    events.hurt ? startClip('hurt') : playClip(world.clip, wanted),
    TICK_SECONDS * 1000,
  )

  const camera = stepCamera(world.camera, {
    x: target.x, y: target.y,
    facing: player.body.vx === 0 ? 0 : Math.sign(player.body.vx),
    falling: !player.body.onGround && player.body.vy > 0,
  }, boundsOf(world.stage))

  return {
    world: {
      ...world,
      map, crumble, player, vitals, clip, shots, camera, cairn, hazards, chests,
      weaponId, rng, nextEnemyId,
      enemies: pruneEnemies(enemies, map),
      respawnTicks: vitals.dead ? RESPAWN_DELAY_TICKS : 0,
      elapsedTicks,
      cleared: world.cleared || bossKilled,
    },
    input: nextInput,
    events,
  }
}

/** 죽어 있는 동안. 체크포인트로 되돌린다 — 스테이지를 처음부터 하지 않는다. */
function stepDead(world: World, input: InputState, balance: Balance): WorldStep {
  const remaining = world.respawnTicks - 1
  if (remaining > 0) {
    return { world: { ...world, respawnTicks: remaining }, input, events: NO_EVENTS }
  }

  // 잔기를 다 썼으면 여기서 멈춘다. 플레이어가 고를 때까지 부활하지 않는다.
  // 잔기가 남아 있으면 아무것도 묻지 않고 바로 되살린다 — 재시작 마찰이
  // 재시도율을 그대로 깎는다. → docs/09 9.3, prompts/m1-gate.md
  if (isGameOver(world.vitals)) {
    return {
      world: { ...world, respawnTicks: 0, gameOver: true },
      input,
      events: world.gameOver ? NO_EVENTS : { ...NO_EVENTS, gameOver: true },
    }
  }

  const vitals = respawn(world.vitals, balance.player)
  const weaponId = world.weaponId

  const size = world.map.tileSize
  const cp = lastCheckpoint(world.stage, world.player.body.x)
  const at = cp ?? world.stage.spawn
  const player = createPlayer(at.tx * size, at.ty * size, balance.player)

  return {
    world: {
      ...world,
      player, vitals, weaponId,
      clip: startClip('idle'),
      shots: EMPTY_WORLD,
      hazards: clearHazards(world.hazards),
      crumble: resetCrumble(),
      map: world.stage.map,
      respawnTicks: 0,
      // 시계를 되감는다. 안 그러면 시간 초과로 죽은 사람이 부활하자마자 또 끊긴다.
      elapsedTicks: 0,
      camera: snapCamera(
        { x: player.body.x, y: player.body.y, facing: 0, falling: false },
        boundsOf(world.stage),
      ),
    },
    input,
    events: NO_EVENTS,
  }
}

/**
 * 게임 오버에서 이어 한다.
 *
 * 잔기와 무기가 초기화되고 마지막 체크포인트에서 다시 시작한다.
 * 스테이지 진행(지나온 거리)은 잃지 않는다.
 */
export function continueFrom(world: World, balance: Balance): World {
  if (!world.gameOver) return world

  const size = world.map.tileSize
  const cp = lastCheckpoint(world.stage, world.player.body.x)
  const at = cp ?? world.stage.spawn
  const fresh = continueGame(balance.player)
  const player = createPlayer(at.tx * size, at.ty * size, balance.player)

  return {
    ...world,
    player,
    vitals: fresh.vitals,
    weaponId: fresh.weaponId,
    clip: startClip('idle'),
    shots: EMPTY_WORLD,
    hazards: clearHazards(world.hazards),
    crumble: resetCrumble(),
    map: world.stage.map,
    respawnTicks: 0,
    elapsedTicks: 0,
    gameOver: false,
    camera: snapCamera(
      { x: player.body.x, y: player.body.y, facing: 0, falling: false },
      boundsOf(world.stage),
    ),
  }
}

