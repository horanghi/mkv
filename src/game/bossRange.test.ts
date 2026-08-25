import { describe, expect, it } from 'vitest'
import { INITIAL_INPUT, advanceInput, frameOf } from '../core/input.ts'
import { loadBalance } from '../data/load.ts'
import { STAGE_1 } from '../data/stages/stage1.ts'
import { CAIRN } from '../entities/bosses/cairn.ts'
import { createWorld, stepWorld, type World } from './world.ts'

const balance = loadBalance()

/**
 * 캐른에게 **안전지대가 없어야 한다.**
 *
 * 강타는 근접(사거리 40), 지진은 보스 주변만 덮는다. 그 바깥을 묘비 투척이
 * 맡지 않으면, 조금 물러나 창만 던지는 것이 최적해가 된다 — 실제로 그랬다.
 * 자동 봇이 그 자리에서 3회 만에 클리어했다.
 *
 * → docs/05 5.4 · prompts/m1-gate.md "첫 클리어 시도 횟수"
 */

/** 그 자리에 못 박고 패턴을 끝까지 돌린다. 맞으면 참. */
function hitAt(pattern: 'slam' | 'throw' | 'quake', gapPx: number): boolean {
  const base = createWorld(STAGE_1, balance)
  const bossX = base.cairn.x
  const groundY = (base.map.height - 1) * 16
  const standX = bossX - gapPx

  let w: World = {
    ...base,
    // 스테이지 잡몹을 치운다. 재는 것은 **보스 패턴이 닿는가** 이지
    // 근처 좀비가 걸어오는가가 아니다.
    enemies: [],
    cairn: { ...base.cairn, awake: true, state: pattern, stateFrames: 0, facing: -1 },
  }

  for (let i = 0; i < 240; i += 1) {
    // 가만히 서 있는 플레이어. 이동으로 피하는지가 아니라 **닿기는 하는지**를 본다.
    w = {
      ...w,
      player: { ...w.player, body: { ...w.player.body, x: standX, y: groundY - 26, vx: 0, vy: 0 } },
      vitals: { ...w.vitals, iFrames: 0, dead: false, armor: 'steel' },
      // 패턴이 끝나면 대기에 못 박는다. 안 그러면 보스가 다음 공격을 골라
      // 이 함수가 "그 패턴이 닿았는가" 를 재지 못한다.
      cairn: w.cairn.state === 'idle' ? { ...w.cairn, stateFrames: 0 } : w.cairn,
    }
    const step = stepWorld(w, INITIAL_INPUT, balance)
    w = step.world
    if (step.events.hurt) return true
  }
  return false
}

/** 그 거리에서 던진 창이 보스에게 닿는가. */
function spearReaches(gapPx: number): boolean {
  const base = createWorld(STAGE_1, balance)
  const bossX = base.cairn.x
  const groundY = (base.map.height - 1) * 16
  const standX = bossX - gapPx

  let w: World = {
    ...base,
    enemies: [],
    cairn: { ...base.cairn, awake: true, state: 'idle', stateFrames: 0, facing: -1 },
    player: {
      ...base.player,
      facing: 1,
      body: { ...base.player.body, x: standX, y: groundY - 26, vx: 0, vy: 0 },
    },
  }
  let input = INITIAL_INPUT
  for (let i = 0; i < 200; i += 1) {
    w = {
      ...w,
      player: { ...w.player, facing: 1, body: { ...w.player.body, x: standX, y: groundY - 26, vx: 0, vy: 0 } },
      cairn: { ...w.cairn, stateFrames: 0 },
    }
    input = advanceInput(input, i < 4 ? frameOf('attack') : 0)
    const step = stepWorld(w, input, balance)
    w = step.world
    input = step.input
    if (step.events.bossHit > 0) return true
  }
  return false
}

describe('캐른 — 안전지대가 없다', () => {
  const DISTANCES = [30, 45, 60, 70, 85, 100, 120, 150]

  it('어떤 거리에도 아무것도 안 닿는 자리가 없다', () => {
    for (const gap of DISTANCES) {
      const reached = (['slam', 'throw', 'quake'] as const).filter((p) => hitAt(p, gap))
      expect([gap, reached.length > 0]).toEqual([gap, true])
    }
  })

  it('세 패턴이 역할을 나눈다 — 근접 · 위치 압박 · 광역', () => {
    // 강타: 근접만. 짧은 것이 설계다
    expect(hitAt('slam', 30)).toBe(true)
    expect(hitAt('slam', 100)).toBe(false)

    // 지진: 거리 무관. 플레이어를 중심으로 떨어진다.
    // **어디에 서 있든 움직이게 만드는 것은 이 패턴이다**
    expect(hitAt('quake', 30)).toBe(true)
    expect(hitAt('quake', 150)).toBe(true)
    expect(hitAt('quake', 300)).toBe(true)

    // 묘비는 여기서 재지 않는다. 서 있는 사람을 때리는 패턴이 아니라
    // 설 자리를 좁히는 **위치 압박**이고, 갈라진 틈이 확정 회피 경로다.
    // → src/game/bossThrow.test.ts
  })

  it('낙석 사이가 확정 회피 경로다 — 간격이 랜슬보다 훨씬 넓다', () => {
    // 가운데 낙석이 선 자리에 떨어지므로 반드시 움직여야 하지만,
    // 옆 낙석까지 80px 이 비어 있어 반응만 하면 피할 수 있다.
    expect(CAIRN.quake.spreadPx / (CAIRN.quake.rockCount - 1)).toBeGreaterThan(12 * 4)
  })

  it('플레이어가 때릴 수 있는 거리에서는 보스도 때릴 수 있다', () => {
    // 이게 진짜 공정성 조건이다. 창이 닿는데 보스는 못 닿는 자리가 있으면
    // 거기 서서 던지기만 하는 것이 최적해가 된다.
    for (const gap of DISTANCES) {
      if (!spearReaches(gap)) continue
      const reached = (['slam', 'throw', 'quake'] as const).some((p) => hitAt(p, gap))
      expect([gap, '창이 닿음', reached]).toEqual([gap, '창이 닿음', true])
    }
  })
})
