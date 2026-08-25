import { describe, expect, it } from 'vitest'
import { loadBalance } from '../../data/load.ts'
import {
  LIVING_ARMORS,
  RELIC_KINDS,
  canRespawn,
  continueGame,
  createVitals,
  emitsLight,
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
} from './vitals.ts'

const balance = loadBalance().player

function cool(vitals: Vitals): Vitals {
  let current = vitals
  for (let i = 0; i < 200 && current.iFrames > 0; i += 1) current = tickVitals(current)
  return current
}

/** 무적을 흘려보내며 연속으로 맞는다. */
function hitRepeatedly(start: Vitals, times: number): Vitals {
  let current = start
  for (let i = 0; i < times; i += 1) current = takeHit(cool(current), balance).vitals
  return current
}

describe('시작 상태', () => {
  it('강철 갑옷 · 잔기 3 · 무적 없음', () => {
    const v = createVitals(balance)
    expect(v.armor).toBe('steel')
    expect(v.lives).toBe(3)
    expect(v.iFrames).toBe(0)
    expect(v.dead).toBe(false)
    expect(v.relic).toBeNull()
  })
})

describe('강등 사슬 — 단계를 건너뛰지 않는다', () => {
  it('성유물 → 강철 → 속옷 → 사망', () => {
    let v = pickUpRelic(createVitals(balance), 'gold', balance)
    expect(v.armor).toBe('relic')

    v = takeHit(cool(v), balance).vitals
    expect(v.armor).toBe('steel')
    expect(v.dead).toBe(false)

    v = takeHit(cool(v), balance).vitals
    expect(v.armor).toBe('bare')
    expect(v.dead).toBe(false)

    const last = takeHit(cool(v), balance)
    expect(last.died).toBe(true)
    expect(last.vitals.dead).toBe(true)
  })

  it('성유물에서 두 대로는 죽지 않는다 — 1회성 유예', () => {
    const relic = pickUpRelic(createVitals(balance), 'silver', balance)
    expect(hitRepeatedly(relic, 2).dead).toBe(false)
    expect(hitRepeatedly(relic, 3).dead).toBe(true)
  })

  it('강철에서 두 대면 죽는다 — 원작의 2피격 사망', () => {
    const steel = createVitals(balance)
    expect(hitRepeatedly(steel, 1).dead).toBe(false)
    expect(hitRepeatedly(steel, 2).dead).toBe(true)
  })

  it('어떤 경로로도 상태를 건너뛰지 않는다', () => {
    // 모든 시작 상태에서 한 대 맞으면 정확히 한 단계만 내려간다.
    const order = [...LIVING_ARMORS]
    for (const armor of order) {
      const start: Vitals = { ...createVitals(balance), armor, relic: armor === 'relic' ? 'gold' : null }
      const after = takeHit(start, balance)
      if (armor === 'bare') {
        expect(after.vitals.dead).toBe(true)
      } else {
        const expected = order[order.indexOf(armor) + 1]
        expect(after.vitals.armor).toBe(expected)
        expect(after.vitals.dead).toBe(false)
      }
    }
  })

  it('갑옷이 깨질 때마다 연출 신호를 준다', () => {
    const relic = pickUpRelic(createVitals(balance), 'crystal', balance)
    expect(takeHit(relic === relic ? cool(relic) : relic, balance).broke).toBe(true)
  })
})

describe('무적', () => {
  it('피격 후 72프레임 — docs/02 2.5', () => {
    expect(balance.iFrames.hit).toBe(72)
    const hit = takeHit(createVitals(balance), balance).vitals
    expect(hit.iFrames).toBe(72)
    expect(isInvulnerable(hit)).toBe(true)
  })

  it('무적 중 피격은 아무 일도 없다 — 데미지를 쌓아두지 않는다', () => {
    const hit = takeHit(createVitals(balance), balance).vitals
    const again = takeHit(hit, balance)
    expect(again.blocked).toBe(true)
    expect(again.vitals).toBe(hit)
    expect(again.vitals.armor).toBe('bare')
  })

  it('무적이 끝나도 밀린 피격이 터지지 않는다', () => {
    let v = takeHit(createVitals(balance), balance).vitals
    for (let i = 0; i < 100; i += 1) {
      takeHit(v, balance) // 매 틱 맞고 있어도
      v = tickVitals(v)
    }
    expect(v.dead).toBe(false)
    expect(v.armor).toBe('bare')
  })

  it('한 틱에 1프레임씩 줄고 0에서 멈춘다', () => {
    let v = takeHit(createVitals(balance), balance).vitals
    for (let i = 0; i < 72; i += 1) v = tickVitals(v)
    expect(v.iFrames).toBe(0)
    expect(tickVitals(v)).toBe(v)
  })

  it('성유물 획득 30 · 리스폰 90프레임', () => {
    expect(pickUpRelic(createVitals(balance), 'gold', balance).iFrames).toBe(30)
    expect(respawn({ ...createVitals(balance), dead: true }, balance).iFrames).toBe(90)
  })

  it('4프레임 주기로 깜빡인다 — 켜짐 2 · 꺼짐 2', () => {
    expect(balance.hitFlashPeriodFrames).toBe(4)

    let v = takeHit(createVitals(balance), balance).vitals
    const pattern: boolean[] = []
    for (let i = 0; i < 72; i += 1) {
      pattern.push(isBlinking(v, balance))
      v = tickVitals(v)
    }

    // 4프레임마다 정확히 절반이 켜진다
    for (let i = 0; i + 4 <= pattern.length; i += 4) {
      expect(pattern.slice(i, i + 4).filter(Boolean)).toHaveLength(2)
    }
    // 주기가 4다 — 4틱 뒤에 같은 상태로 돌아온다
    for (let i = 0; i + 4 < pattern.length; i += 1) {
      expect(pattern[i + 4]).toBe(pattern[i])
    }
  })

  it('무적이 아니면 깜빡이지 않는다', () => {
    expect(isBlinking(createVitals(balance), balance)).toBe(false)
  })
})

describe('낙사 — 갑옷과 무관하게 즉사', () => {
  it('성유물을 입고 있어도 죽는다', () => {
    const relic = pickUpRelic(createVitals(balance), 'gold', balance)
    expect(fallIntoPit(relic).dead).toBe(true)
  })

  it('무적 중에도 죽는다 — 구덩이는 공격이 아니라 지형이다', () => {
    const invuln = takeHit(createVitals(balance), balance).vitals
    expect(isInvulnerable(invuln)).toBe(true)
    expect(fallIntoPit(invuln).dead).toBe(true)
  })

  it('죽으면 무적이 사라진다', () => {
    expect(fallIntoPit(createVitals(balance)).iFrames).toBe(0)
  })
})

describe('성유물', () => {
  it('세 종류가 있다', () => {
    for (const kind of RELIC_KINDS) {
      expect(pickUpRelic(createVitals(balance), kind, balance).relic).toBe(kind)
    }
  })

  it('겹쳐 입어도 HP 가 늘지 않는다 — 종류만 바뀐다', () => {
    const gold = pickUpRelic(createVitals(balance), 'gold', balance)
    const silver = pickUpRelic(gold, 'silver', balance)
    expect(silver.armor).toBe('relic')
    expect(silver.relic).toBe('silver')
    expect(hitRepeatedly(silver, 3).dead).toBe(true)
  })

  it('강등되면 성유물 종류도 사라진다', () => {
    const gold = pickUpRelic(createVitals(balance), 'gold', balance)
    expect(takeHit(cool(gold), balance).vitals.relic).toBeNull()
  })

  it('죽은 뒤에는 주울 수 없다', () => {
    const dead = fallIntoPit(createVitals(balance))
    expect(pickUpRelic(dead, 'gold', balance)).toBe(dead)
  })

  it('빛난다 — 어두운 스테이지에서 갑옷이 등불이다', () => {
    expect(emitsLight(pickUpRelic(createVitals(balance), 'gold', balance))).toBe(true)
    expect(emitsLight(createVitals(balance))).toBe(false)
    // 잃으면 세계가 실제로 어두워진다
    const lost = takeHit(cool(pickUpRelic(createVitals(balance), 'gold', balance)), balance).vitals
    expect(emitsLight(lost)).toBe(false)
  })
})

describe('잔기와 컨티뉴', () => {
  it('부활할 때마다 잔기를 하나 쓴다', () => {
    let v = fallIntoPit(createVitals(balance))
    v = respawn(v, balance)
    expect(v.lives).toBe(2)
    expect(v.armor).toBe('steel')
    expect(v.dead).toBe(false)
  })

  it('성유물은 부활해도 돌아오지 않는다', () => {
    const relic = pickUpRelic(createVitals(balance), 'gold', balance)
    const revived = respawn(fallIntoPit(relic), balance)
    expect(revived.armor).toBe('steel')
    expect(revived.relic).toBeNull()
  })

  it('잔기를 다 쓰면 게임 오버', () => {
    let v = createVitals(balance)
    for (let i = 0; i < 3; i += 1) v = respawn(fallIntoPit(v), balance)
    expect(v.lives).toBe(0)

    const last = fallIntoPit(v)
    expect(canRespawn(last)).toBe(false)
    expect(isGameOver(last)).toBe(true)
    expect(respawn(last, balance)).toBe(last)
  })

  it('살아 있으면 게임 오버가 아니다', () => {
    expect(isGameOver(createVitals(balance))).toBe(false)
    expect(isGameOver({ ...createVitals(balance), lives: 0 })).toBe(false)
  })

  it('컨티뉴는 잔기를 3으로 되돌리고 무기를 창으로 되돌린다', () => {
    const result = continueGame(balance)
    expect(result.vitals.lives).toBe(3)
    expect(result.vitals.armor).toBe('steel')
    expect(result.vitals.dead).toBe(false)
    // 페널티 — 모아둔 무기를 잃는다
    expect(result.weaponId).toBe('lance')
  })
})

describe('상태별 능력', () => {
  it('속옷은 8% 빠르다 — 공포 보정', () => {
    const bare: Vitals = { ...createVitals(balance), armor: 'bare' }
    expect(speedMultiplier(bare, balance)).toBeCloseTo(1.08)
    expect(speedMultiplier(createVitals(balance), balance)).toBe(1)
    expect(speedMultiplier({ ...createVitals(balance), armor: 'relic' }, balance)).toBe(1)
  })
})

describe('스프라이트 상태', () => {
  it('살아 있으면 갑옷 상태를 그대로 쓴다', () => {
    expect(spriteStateOf(createVitals(balance))).toBe('steel')
    expect(spriteStateOf(pickUpRelic(createVitals(balance), 'gold', balance))).toBe('relic')
  })

  it('사망은 백골로 그린다', () => {
    expect(spriteStateOf(fallIntoPit(createVitals(balance)))).toBe('bones')
  })
})

describe('불변성', () => {
  it('원본을 바꾸지 않는다', () => {
    const v = createVitals(balance)
    const snapshot = JSON.stringify(v)
    takeHit(v, balance)
    fallIntoPit(v)
    pickUpRelic(v, 'gold', balance)
    tickVitals(v)
    expect(JSON.stringify(v)).toBe(snapshot)
  })
})
