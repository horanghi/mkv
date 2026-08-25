import { TICK_SECONDS } from '../core/config.ts'
import { createRng, nextFloat, type RngState } from '../core/rng.ts'
import type { InputState } from '../core/input.ts'
import { isDown } from '../core/input.ts'
import type { Balance } from '../data/load.ts'
import { requireWeapon } from '../data/load.ts'
import {
  awaken, damageCairn, createCairn, fragmentBoxes, slamBox, stepCairn, bodyBox,
  type Cairn,
} from '../entities/bosses/cairn.ts'
import {
  boxOfEnemy, createEnemy, damage, pruneEnemies, tickFlash, touches, type Enemy,
} from '../entities/enemies/enemy.ts'
import { stepCorvid } from '../entities/enemies/corvid.ts'
import { stepGhoul, isVulnerable } from '../entities/enemies/ghoul.ts'
import { stepGrimm } from '../entities/enemies/grimm.ts'
import { nextClip } from '../entities/player/animation.ts'
import { createPlayer, stepPlayer, type Player } from '../entities/player/player.ts'
import {
  createVitals, fallIntoPit, respawn, speedMultiplier, takeHit, tickVitals,
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
  readonly camera: Camera
  readonly weaponId: string
  readonly rng: RngState
  readonly nextEnemyId: number
  /** 사망 후 부활까지 남은 틱 */
  readonly respawnTicks: number
  readonly cleared: boolean
}

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
}

const NO_EVENTS: WorldEvents = Object.freeze({
  armorBroke: false, died: false, hurt: false, enemiesKilled: 0,
  bossHit: 0, bossKilled: false, quake: false, fired: false, landed: false,
})

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
    camera: snapCamera({ x: player.body.x, y: player.body.y, facing: 0, falling: false },
      boundsOf(stage)),
    weaponId: 'lance',
    rng,
    nextEnemyId: id,
    respawnTicks: 0,
    cleared: false,
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

  let enemies = world.enemies.map((enemy) => {
    const alive = tickFlash(enemy)
    switch (alive.kind) {
      case 'ghoul': return stepGhoul(alive, map, balance.player.gravityFalling, dt)
      case 'grimm': return stepGrimm(alive, map, { target, view }, balance.player.gravityFalling, dt)
      default: return stepCorvid(alive, map, target, dt)
    }
  })

  // --- 보스 -----------------------------------------------------------------
  let cairn = world.cairn
  if (!cairn.awake && player.body.x >= world.stage.bossGateX) cairn = awaken(cairn)
  const bossStep = stepCairn(cairn, { target, groundY: (map.height - 1) * map.tileSize }, dt)
  cairn = bossStep.cairn
  if (bossStep.emission.quake) events = { ...events, quake: true }

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
    if (!consumed) survivors.push(shot)
  }
  shots = { ...shots, projectiles: survivors }
  events = { ...events, enemiesKilled: killed, bossHit, bossKilled }

  // --- 피격 -----------------------------------------------------------------
  let vitals = tickVitals(world.vitals)
  if (!isInvulnerable(vitals)) {
    const hitBy = enemies.some((e) => touches(e, playerBox) && isVulnerable(e))
      || fragmentBoxes(cairn).some((b) => overlaps(b, playerBox))
      || (slamBox(cairn) !== null && overlaps(slamBox(cairn)!, playerBox))
      || (cairn.awake && cairn.state !== 'dead' && overlaps(bodyBox(cairn), playerBox))

    if (hitBy) {
      const result = takeHit(vitals, balance.player)
      vitals = result.vitals
      events = { ...events, hurt: true, armorBroke: result.broke, died: result.died }
    }
  }

  // 낙사는 갑옷과 무관하게 즉사다.
  const fellOut = player.body.y > (map.height + 2) * map.tileSize
  if (fellOut && !vitals.dead) {
    vitals = fallIntoPit(vitals)
    events = { ...events, died: true }
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
      map, crumble, player, vitals, clip, shots, camera, cairn, rng, nextEnemyId,
      enemies: pruneEnemies(enemies),
      respawnTicks: vitals.dead ? RESPAWN_DELAY_TICKS : 0,
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

  const vitals = isGameOver(world.vitals)
    ? continueGame(balance.player).vitals
    : respawn(world.vitals, balance.player)
  const weaponId = isGameOver(world.vitals) ? 'lance' : world.weaponId

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
      crumble: resetCrumble(),
      map: world.stage.map,
      respawnTicks: 0,
      camera: snapCamera(
        { x: player.body.x, y: player.body.y, facing: 0, falling: false },
        boundsOf(world.stage),
      ),
    },
    input,
    events: NO_EVENTS,
  }
}

/** 디버그 — 재시작 요청인가. */
export function wantsRestart(input: InputState): boolean {
  return isDown(input.pressed, 'restart')
}
