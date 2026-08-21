import {
  asArray,
  asEnum,
  asInteger,
  asNonNegative,
  asNumber,
  asRecord,
  asString,
  assertUniqueIds,
  requireKey,
} from './validate.ts'

/**
 * 밸런스 데이터의 타입과 파서.
 *
 * 원본 표는 `docs/` 에 있고 JSON 은 그 표의 사본이다.
 * **코드에 수치를 직접 쓰지 않는다** — 갈라지는 순간 밸런싱이 불가능해진다.
 */

export interface Size {
  readonly width: number
  readonly height: number
}

export interface IFrames {
  readonly hit: number
  readonly relicPickup: number
  readonly respawn: number
}

export interface PlayerBalance {
  readonly hitbox: Size
  readonly crouchHitbox: Size
  readonly footProbe: { readonly width: number; readonly depth: number }

  readonly runSpeed: number
  readonly accel: number
  readonly decel: number
  /** 공중 가속은 0 이다. 고정 점프 궤도 — GOAL 비협상 원칙 1. */
  readonly airAccel: number
  readonly bareSpeedBonus: number

  readonly jumpVelocity: number
  readonly gravityRising: number
  readonly gravityFalling: number
  readonly maxFallSpeed: number

  readonly coyoteFrames: number
  readonly jumpBufferFrames: number
  readonly cornerCorrectionPx: number
  readonly ledgeGripFrames: number

  readonly attackStartupFrames: number
  readonly attackRecoveryFrames: number
  readonly attackUpRecoveryFrames: number

  readonly iFrames: IFrames
  readonly hitFlashPeriodFrames: number

  readonly startingLives: number
  readonly stageTimeLimitSeconds: number
  readonly timeWarningSeconds: number
}

export const PROJECTILE_ARCS = ['straight', 'parabolic', 'bounce'] as const
export type ProjectileArc = (typeof PROJECTILE_ARCS)[number]

export interface WeaponBalance {
  readonly id: string
  readonly name: string
  readonly damage: number
  readonly cooldownFrames: number
  readonly speed: number
  readonly arc: ProjectileArc
  readonly maxOnScreen: number
}

export interface EnemyBalance {
  readonly id: string
  readonly name: string
  readonly hp: number
  readonly stages: readonly string[]
}

export interface BossBalance {
  readonly id: string
  readonly name: string
  readonly hp: number
  readonly stage: string
  readonly phases: number
}

export function parsePlayer(raw: unknown): PlayerBalance {
  const r = asRecord(raw, 'player')
  const num = (key: string) => asNumber(requireKey(r, key, 'player'), `player.${key}`)
  const frames = (key: string) => asInteger(requireKey(r, key, 'player'), `player.${key}`)

  return {
    hitbox: parseSize(requireKey(r, 'hitbox', 'player'), 'player.hitbox'),
    crouchHitbox: parseSize(requireKey(r, 'crouchHitbox', 'player'), 'player.crouchHitbox'),
    footProbe: parseFootProbe(requireKey(r, 'footProbe', 'player')),

    runSpeed: num('runSpeed'),
    accel: num('accel'),
    decel: num('decel'),
    airAccel: num('airAccel'),
    bareSpeedBonus: num('bareSpeedBonus'),

    jumpVelocity: num('jumpVelocity'),
    gravityRising: num('gravityRising'),
    gravityFalling: num('gravityFalling'),
    maxFallSpeed: num('maxFallSpeed'),

    coyoteFrames: frames('coyoteFrames'),
    jumpBufferFrames: frames('jumpBufferFrames'),
    cornerCorrectionPx: num('cornerCorrectionPx'),
    ledgeGripFrames: frames('ledgeGripFrames'),

    attackStartupFrames: frames('attackStartupFrames'),
    attackRecoveryFrames: frames('attackRecoveryFrames'),
    attackUpRecoveryFrames: frames('attackUpRecoveryFrames'),

    iFrames: parseIFrames(requireKey(r, 'iFrames', 'player')),
    hitFlashPeriodFrames: frames('hitFlashPeriodFrames'),

    startingLives: frames('startingLives'),
    stageTimeLimitSeconds: num('stageTimeLimitSeconds'),
    timeWarningSeconds: num('timeWarningSeconds'),
  }
}

export function parseWeapons(raw: unknown): readonly WeaponBalance[] {
  const list = asArray(requireKey(asRecord(raw, 'weapons'), 'weapons', 'weapons'), 'weapons.weapons')

  const weapons = list.map((entry, i) => {
    const path = `weapons[${i}]`
    const r = asRecord(entry, path)
    return {
      id: asString(requireKey(r, 'id', path), `${path}.id`),
      name: asString(requireKey(r, 'name', path), `${path}.name`),
      damage: asNonNegative(requireKey(r, 'damage', path), `${path}.damage`),
      cooldownFrames: asInteger(requireKey(r, 'cooldownFrames', path), `${path}.cooldownFrames`),
      speed: asNonNegative(requireKey(r, 'speed', path), `${path}.speed`),
      arc: asEnum(requireKey(r, 'arc', path), `${path}.arc`, PROJECTILE_ARCS),
      maxOnScreen: asInteger(requireKey(r, 'maxOnScreen', path), `${path}.maxOnScreen`),
    }
  })

  assertUniqueIds(weapons.map((w) => w.id), 'weapons')
  return weapons
}

export function parseEnemies(raw: unknown): readonly EnemyBalance[] {
  const list = asArray(requireKey(asRecord(raw, 'enemies'), 'enemies', 'enemies'), 'enemies.enemies')

  const enemies = list.map((entry, i) => {
    const path = `enemies[${i}]`
    const r = asRecord(entry, path)
    return {
      id: asString(requireKey(r, 'id', path), `${path}.id`),
      name: asString(requireKey(r, 'name', path), `${path}.name`),
      hp: asNonNegative(requireKey(r, 'hp', path), `${path}.hp`),
      stages: asArray(requireKey(r, 'stages', path), `${path}.stages`).map((s, j) =>
        asString(s, `${path}.stages[${j}]`),
      ),
    }
  })

  assertUniqueIds(enemies.map((e) => e.id), 'enemies')
  return enemies
}

export function parseBosses(raw: unknown): readonly BossBalance[] {
  const list = asArray(requireKey(asRecord(raw, 'bosses'), 'bosses', 'bosses'), 'bosses.bosses')

  const bosses = list.map((entry, i) => {
    const path = `bosses[${i}]`
    const r = asRecord(entry, path)
    return {
      id: asString(requireKey(r, 'id', path), `${path}.id`),
      name: asString(requireKey(r, 'name', path), `${path}.name`),
      hp: asNonNegative(requireKey(r, 'hp', path), `${path}.hp`),
      stage: asString(requireKey(r, 'stage', path), `${path}.stage`),
      phases: asInteger(requireKey(r, 'phases', path), `${path}.phases`),
    }
  })

  assertUniqueIds(bosses.map((b) => b.id), 'bosses')
  return bosses
}

function parseSize(raw: unknown, path: string): Size {
  const r = asRecord(raw, path)
  return {
    width: asNonNegative(requireKey(r, 'width', path), `${path}.width`),
    height: asNonNegative(requireKey(r, 'height', path), `${path}.height`),
  }
}

function parseFootProbe(raw: unknown): { readonly width: number; readonly depth: number } {
  const path = 'player.footProbe'
  const r = asRecord(raw, path)
  return {
    width: asNonNegative(requireKey(r, 'width', path), `${path}.width`),
    depth: asNonNegative(requireKey(r, 'depth', path), `${path}.depth`),
  }
}

function parseIFrames(raw: unknown): IFrames {
  const path = 'player.iFrames'
  const r = asRecord(raw, path)
  return {
    hit: asInteger(requireKey(r, 'hit', path), `${path}.hit`),
    relicPickup: asInteger(requireKey(r, 'relicPickup', path), `${path}.relicPickup`),
    respawn: asInteger(requireKey(r, 'respawn', path), `${path}.respawn`),
  }
}
