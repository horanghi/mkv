import { describe, expect, it } from 'vitest'
import { INITIAL_INPUT } from '../core/input.ts'
import { loadBalance } from '../data/load.ts'
import { STAGE_1 } from '../data/stages/stage1.ts'
import {
  CAIRN, THROW_GAP_PX, THROW_LAUNCH_VY as CAIRN_THROW_VY,
} from '../entities/bosses/cairn.ts'
import { boxOfHazard } from '../entities/bosses/hazard.ts'
import { overlaps } from '../physics/aabb.ts'
import { boxOf } from '../physics/body.ts'
import { createWorld, stepWorld, type World } from './world.ts'

const balance = loadBalance()

/**
 * 묘비 투척의 확정 회피 경로.
 *
 * docs/05 5.4: "포물선 2개. 착지점이 갈라져 있어 **사이로 피할 수 있다.**"
 * 갈라진 틈에 선 플레이어는 **가만히 있어도** 맞지 않아야 한다.
 * 그게 아니면 "갈라져 있다"는 말이 거짓이 된다.
 *
 * 광역을 맡는 것은 지진이다 — 그쪽은 선 자리에 떨어진다.
 */
describe('묘비 — 사이에 서면 안 맞는다', () => {
  /** 그 거리에 못 박고 투척 패턴을 끝까지 돌린다. 스치기라도 하면 참. */
  function grazedAt(gapPx: number): boolean {
    const base = createWorld(STAGE_1, balance)
    const bossX = base.cairn.x
    const groundY = (base.map.height - 1) * 16
    const standX = bossX - gapPx

    let w: World = {
      ...base,
      enemies: [],
      cairn: { ...base.cairn, awake: true, state: 'throw', stateFrames: 0, facing: -1 },
    }

    for (let i = 0; i < 200; i += 1) {
      w = {
        ...w,
        player: { ...w.player, body: { ...w.player.body, x: standX, y: groundY - 26, vx: 0, vy: 0 } },
        vitals: { ...w.vitals, iFrames: 0, dead: false, armor: 'steel' },
        cairn: w.cairn.state === 'idle' ? { ...w.cairn, stateFrames: 0 } : w.cairn,
      }
      const step = stepWorld(w, INITIAL_INPUT, balance)
      w = step.world

      const playerBox = boxOf(w.player.body)
      for (const hazard of w.hazards.hazards) {
        if (hazard.kind === 'gravestone' && overlaps(boxOfHazard(hazard), playerBox)) return true
      }
      if (step.events.hurt) return true
    }
    return false
  }

  const RANGES = [60, 80, 100, 120, 140, 160]

  it('묘비 사거리 안 어디에 서 있어도 스치지 않는다', () => {
    for (const gap of RANGES) {
      expect([gap, grazedAt(gap)]).toEqual([gap, false])
    }
  })

  it('포물선이 충분히 가파르다 — 낮게 던지면 지나가며 몸을 스친다', () => {
    // 실측: vy −170 이면 98px 거리에서 머리 높이 19px 로 지나가 26px 랜슬에 걸렸다.
    expect(Math.abs(CAIRN_THROW_VY)).toBeGreaterThan(300)
  })

  it('두 착지점이 랜슬보다 훨씬 넓게, 거리와 무관하게 갈라진다', () => {
    // 비율로 갈라면 가까울수록 틈이 좁아져 근거리에서 회피 경로가 사라진다.
    expect(THROW_GAP_PX).toBeGreaterThan(12 * 4)
    expect(CAIRN.throwPattern.count).toBe(2)
  })
})
