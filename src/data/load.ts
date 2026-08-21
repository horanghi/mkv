import bossesJson from './bosses.json'
import enemiesJson from './enemies.json'
import playerJson from './player.json'
import weaponsJson from './weapons.json'
import {
  parseBosses,
  parseEnemies,
  parsePlayer,
  parseWeapons,
  type BossBalance,
  type EnemyBalance,
  type PlayerBalance,
  type WeaponBalance,
} from './balance.ts'

/** 파싱이 끝난 밸런스 한 묶음. 게임 코드는 이 객체만 본다. */
export interface Balance {
  readonly player: PlayerBalance
  readonly weapons: readonly WeaponBalance[]
  readonly enemies: readonly EnemyBalance[]
  readonly bosses: readonly BossBalance[]
}

/** 임의의 원본 객체에서 밸런스를 만든다. 테스트와 핫리로드가 함께 쓴다. */
export function parseBalance(raw: {
  player: unknown
  weapons: unknown
  enemies: unknown
  bosses: unknown
}): Balance {
  return {
    player: parsePlayer(raw.player),
    weapons: parseWeapons(raw.weapons),
    enemies: parseEnemies(raw.enemies),
    bosses: parseBosses(raw.bosses),
  }
}

/** 번들에 포함된 JSON 을 파싱한다. 실패하면 던진다 — 잘못된 밸런스로 켜지느니 안 켜지는 게 낫다. */
export function loadBalance(): Balance {
  return parseBalance({
    player: playerJson,
    weapons: weaponsJson,
    enemies: enemiesJson,
    bosses: bossesJson,
  })
}

/** id 로 무기를 찾는다. 없으면 undefined — 호출부가 기본 무기로 폴백한다. */
export function findWeapon(
  balance: Balance,
  id: string,
): WeaponBalance | undefined {
  return balance.weapons.find((w) => w.id === id)
}

/** 반드시 있어야 하는 무기를 가져온다. 없으면 데이터가 망가진 것이므로 던진다. */
export function requireWeapon(balance: Balance, id: string): WeaponBalance {
  const weapon = findWeapon(balance, id)
  if (!weapon) throw new Error(`무기 데이터가 없다: "${id}"`)
  return weapon
}
