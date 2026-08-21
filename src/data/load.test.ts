import { describe, expect, it } from 'vitest'
import { parseBosses, parseEnemies, parsePlayer, parseWeapons } from './balance.ts'
import { BalanceError } from './validate.ts'
import { findWeapon, loadBalance, parseBalance, requireWeapon } from './load.ts'

const balance = loadBalance()

/**
 * 이 파일은 JSON 이 `docs/` 의 표와 일치하는지 지키는 자물쇠다.
 * 표를 고치면 여기도 함께 깨져야 한다 — 그게 목적이다.
 */
describe('밸런스 로드', () => {
  it('네 묶음이 전부 파싱된다', () => {
    expect(balance.weapons).toHaveLength(7)
    expect(balance.enemies).toHaveLength(14)
    expect(balance.bosses).toHaveLength(7)
  })

  it('플레이어 수치가 docs/02 표와 같다', () => {
    const p = balance.player
    expect(p.runSpeed).toBe(110)
    expect(p.accel).toBe(900)
    expect(p.decel).toBe(1400)
    expect(p.jumpVelocity).toBe(-420)
    expect(p.gravityRising).toBe(1500)
    expect(p.gravityFalling).toBe(1750)
    expect(p.maxFallSpeed).toBe(480)
    expect(p.coyoteFrames).toBe(5)
    expect(p.jumpBufferFrames).toBe(6)
    expect(p.cornerCorrectionPx).toBe(3)
    expect(p.iFrames.hit).toBe(72)
    expect(p.hitbox).toEqual({ width: 12, height: 26 })
    expect(p.crouchHitbox).toEqual({ width: 12, height: 16 })
    expect(p.startingLives).toBe(3)
  })

  it('공중 가속이 0 이다 — GOAL 비협상 원칙 1', () => {
    // 이 값이 0 이 아니게 되는 순간 고정 점프 궤도가 무너진다.
    expect(balance.player.airAccel).toBe(0)
  })

  it('하강 중력이 상승 중력보다 크다 — 묵직함', () => {
    expect(balance.player.gravityFalling).toBeGreaterThan(balance.player.gravityRising)
  })

  it('창이 기본 무기 수치를 갖는다', () => {
    const lance = findWeapon(balance, 'lance')
    expect(lance).toMatchObject({
      damage: 10,
      cooldownFrames: 20,
      speed: 320,
      arc: 'straight',
      maxOnScreen: 2,
    })
  })

  it('단검만 화면 3발이다 — 원작 계승', () => {
    for (const w of balance.weapons) {
      expect(w.maxOnScreen).toBe(w.id === 'dagger' ? 3 : 2)
    }
  })

  it('없는 무기는 undefined 를 준다', () => {
    expect(findWeapon(balance, 'chainsaw')).toBeUndefined()
  })

  it('반드시 있어야 하는 무기가 없으면 던진다', () => {
    expect(requireWeapon(balance, 'lance').id).toBe('lance')
    expect(() => requireWeapon(balance, 'chainsaw')).toThrow(/무기 데이터가 없다/)
  })

  it('좀비 HP 20, 캐른 HP 300 — 데미지 표의 기준값', () => {
    expect(balance.enemies.find((e) => e.id === 'ghoul')?.hp).toBe(20)
    expect(balance.bosses.find((b) => b.id === 'cairn')?.hp).toBe(300)
  })

  it('스테이지 1 적은 좀비·그림·까마귀 셋뿐이다', () => {
    const s1 = balance.enemies.filter((e) => e.stages.includes('S1')).map((e) => e.id)
    expect(s1).toEqual(['ghoul', 'grimm', 'corvid', 'wizard'])
  })
})

describe('파서 오류', () => {
  it('플레이어 필수 키가 없으면 경로와 함께 알려준다', () => {
    expect(() => parsePlayer({})).toThrow('player.hitbox: 없다')
  })

  it('무기 궤도 오타를 잡는다', () => {
    const bad = {
      weapons: [
        { id: 'x', name: 'x', damage: 1, cooldownFrames: 1, speed: 1, arc: 'diagonal', maxOnScreen: 1 },
      ],
    }
    expect(() => parseWeapons(bad)).toThrow(/weapons\[0\]\.arc/)
  })

  it('무기 id 중복을 잡는다', () => {
    const dup = {
      weapons: [
        { id: 'x', name: 'x', damage: 1, cooldownFrames: 1, speed: 1, arc: 'straight', maxOnScreen: 1 },
        { id: 'x', name: 'y', damage: 2, cooldownFrames: 1, speed: 1, arc: 'straight', maxOnScreen: 1 },
      ],
    }
    expect(() => parseWeapons(dup)).toThrow(/중복/)
  })

  it('적 HP 가 음수면 거부한다', () => {
    expect(() => parseEnemies({ enemies: [{ id: 'a', name: 'a', hp: -1, stages: [] }] })).toThrow(
      /enemies\[0\]\.hp/,
    )
  })

  it('보스 페이즈 수가 정수가 아니면 거부한다', () => {
    expect(() =>
      parseBosses({ bosses: [{ id: 'a', name: 'a', hp: 1, stage: 'S1', phases: 2.5 }] }),
    ).toThrow(/bosses\[0\]\.phases/)
  })

  it('parseBalance 는 네 묶음을 한 번에 검증한다', () => {
    expect(() =>
      parseBalance({ player: {}, weapons: { weapons: [] }, enemies: { enemies: [] }, bosses: { bosses: [] } }),
    ).toThrow(BalanceError)
  })
})
