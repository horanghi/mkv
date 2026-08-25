import { describe, expect, it } from 'vitest'
import { loadBalance } from '../data/load.ts'
import { STAGE_1 } from '../data/stages/stage1.ts'
import {
  DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_RULES,
  applyDifficulty, applyDifficultyToStage, parseDifficulty, rulesFor,
} from './difficulty.ts'
import { INITIAL_INPUT } from '../core/input.ts'
import { createWorld, stepWorld } from './world.ts'

const balance = loadBalance()

describe('난이도 3단계', () => {
  it('세 단계다 — docs/08 8.4', () => {
    expect(DIFFICULTIES).toEqual(['squire', 'knight', 'paladin'])
    expect(DEFAULT_DIFFICULTY).toBe('knight')
  })

  it('관용이 단조롭게 줄어든다 — 잔기·시간·체크포인트', () => {
    const order = DIFFICULTIES.map(rulesFor)
    for (let i = 1; i < order.length; i += 1) {
      expect([order[i]!.id, order[i]!.lives < order[i - 1]!.lives]).toEqual([order[i]!.id, true])
      expect([order[i]!.id, order[i]!.stageTimeSeconds < order[i - 1]!.stageTimeSeconds])
        .toEqual([order[i]!.id, true])
      expect([order[i]!.id, order[i]!.checkpoints < order[i - 1]!.checkpoints])
        .toEqual([order[i]!.id, true])
    }
  })

  it('적 HP·데미지는 건드리지 않는다 — 규칙에 그런 항목이 없다', () => {
    for (const rules of Object.values(DIFFICULTY_RULES)) {
      expect(Object.keys(rules)).not.toContain('enemyHp')
      expect(Object.keys(rules)).not.toContain('enemyDamage')
    }
  })

  it('이동·점프 수치는 난이도로 바뀌지 않는다 — 고정 점프 궤도는 비협상이다', () => {
    for (const id of DIFFICULTIES) {
      const tuned = applyDifficulty(balance, id)
      expect([id, tuned.player.jumpVelocity]).toEqual([id, balance.player.jumpVelocity])
      expect([id, tuned.player.gravityRising]).toEqual([id, balance.player.gravityRising])
      expect([id, tuned.player.gravityFalling]).toEqual([id, balance.player.gravityFalling])
      expect([id, tuned.player.runSpeed]).toEqual([id, balance.player.runSpeed])
      expect([id, tuned.player.airAccel]).toEqual([id, balance.player.airAccel])
    }
  })

  it('잔기와 제한 시간만 밸런스에 반영된다', () => {
    const squire = applyDifficulty(balance, 'squire')
    expect(squire.player.startingLives).toBe(DIFFICULTY_RULES.squire.lives)
    expect(squire.player.stageTimeLimitSeconds).toBe(DIFFICULTY_RULES.squire.stageTimeSeconds)

    const paladin = applyDifficulty(balance, 'paladin')
    expect(paladin.player.startingLives).toBeLessThan(squire.player.startingLives)
  })

  it('원본 밸런스를 바꾸지 않는다', () => {
    const before = balance.player.startingLives
    applyDifficulty(balance, 'paladin')
    expect(balance.player.startingLives).toBe(before)
  })
})

describe('난이도가 스테이지에 붙는 방식', () => {
  it('체크포인트를 앞에서부터 남긴다 — 뒤만 남기면 초반이 통째로 무체크포인트가 된다', () => {
    const paladin = applyDifficultyToStage(STAGE_1, 'paladin')
    expect(paladin.checkpoints).toHaveLength(1)
    expect(paladin.checkpoints[0]).toEqual(STAGE_1.checkpoints[0])
  })

  it('스테이지가 가진 것보다 많이 요구해도 있는 만큼만 쓴다', () => {
    const squire = applyDifficultyToStage(STAGE_1, 'squire')
    expect(squire.checkpoints.length).toBeLessThanOrEqual(STAGE_1.checkpoints.length)
    expect(squire.checkpoints.length).toBe(STAGE_1.checkpoints.length)
  })

  it('종자는 그림이 줄어든다 — 시리즈 전통의 트라우마라 따로 조절한다', () => {
    const all = STAGE_1.enemies.filter((e) => e.kind === 'grimm').length
    const squire = applyDifficultyToStage(STAGE_1, 'squire')
      .enemies.filter((e) => e.kind === 'grimm').length
    const knight = applyDifficultyToStage(STAGE_1, 'knight')
      .enemies.filter((e) => e.kind === 'grimm').length

    expect(all).toBeGreaterThan(0)
    expect(knight).toBe(all)
    expect(squire).toBeLessThan(all)
  })

  it('성기사는 적이 늘어난다 — 새 좌표를 지어내지 않고 검증된 자리 옆에 세운다', () => {
    const knight = applyDifficultyToStage(STAGE_1, 'knight').enemies
    const paladin = applyDifficultyToStage(STAGE_1, 'paladin').enemies

    expect(paladin.length).toBeGreaterThan(knight.length)
    // 늘어난 적은 전부 원래 배치에서 2타일 옆이다
    const originals = new Set(knight.map((e) => `${e.kind}:${e.tx}`))
    for (const enemy of paladin.slice(knight.length)) {
      expect([enemy.kind, originals.has(`${enemy.kind}:${enemy.tx - 2}`)])
        .toEqual([enemy.kind, true])
    }
  })

  it('기본 난이도는 스테이지를 그대로 둔다', () => {
    const knight = applyDifficultyToStage(STAGE_1, 'knight')
    expect(knight.enemies).toEqual(STAGE_1.enemies)
    expect(knight.checkpoints).toEqual(STAGE_1.checkpoints)
  })

  it('지형과 보스 게이트는 난이도로 바뀌지 않는다', () => {
    for (const id of DIFFICULTIES) {
      const tuned = applyDifficultyToStage(STAGE_1, id)
      expect([id, tuned.map]).toEqual([id, STAGE_1.map])
      expect([id, tuned.bossGateX]).toEqual([id, STAGE_1.bossGateX])
      expect([id, tuned.sections]).toEqual([id, STAGE_1.sections])
    }
  })
})

describe('저장된 설정 읽기', () => {
  it('아는 값은 그대로', () => {
    for (const id of DIFFICULTIES) expect(parseDifficulty(id)).toBe(id)
  })

  it('모르는 값은 기본으로 떨어진다 — 낡은 설정일 수 있다', () => {
    expect(parseDifficulty('penance')).toBe(DEFAULT_DIFFICULTY)
    expect(parseDifficulty(null)).toBe(DEFAULT_DIFFICULTY)
    expect(parseDifficulty(3)).toBe(DEFAULT_DIFFICULTY)
    expect(parseDifficulty(undefined)).toBe(DEFAULT_DIFFICULTY)
  })
})

/**
 * 제한 시간이 난이도마다 실제로 다르게 끊는가.
 *
 * 표에 8분·5분·4분이 적혀 있어도 월드가 그 값으로 끊지 않으면 화면에 뜨는
 * 숫자만 다른 것이다. 관용 축은 **작동해야** 축이다. → docs/02 2.8 · docs/08 8.4
 */
describe('제한 시간이 난이도를 따른다', () => {
  const base = loadBalance()

  for (const id of DIFFICULTIES) {
    it(`${rulesFor(id).name} — ${rulesFor(id).stageTimeSeconds / 60}분에 끊긴다`, () => {
      const balance = applyDifficulty(base, id)
      const limit = Math.round(rulesFor(id).stageTimeSeconds * 60)
      const world = createWorld(applyDifficultyToStage(STAGE_1, id), balance)

      const 직전 = stepWorld({ ...world, elapsedTicks: limit - 2 }, INITIAL_INPUT, balance)
      expect(직전.world.vitals.dead).toBe(false)

      const 초과 = stepWorld({ ...world, elapsedTicks: limit - 1 }, INITIAL_INPUT, balance)
      expect(초과.events.cause).toBe('timeout')
    })
  }

  it('종자가 성기사보다 오래 버틴다', () => {
    const 종자 = applyDifficulty(base, 'squire').player.stageTimeLimitSeconds
    const 성기사 = applyDifficulty(base, 'paladin').player.stageTimeLimitSeconds
    expect(종자).toBeGreaterThan(성기사)
  })
})
