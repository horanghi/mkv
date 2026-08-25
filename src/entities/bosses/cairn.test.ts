import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../../core/config.ts'
import { createRng } from '../../core/rng.ts'
import { loadBalance } from '../../data/load.ts'
import {
  CAIRN,
  awaken,
  bodyBox,
  chooseAttack,
  coreBox,
  createCairn,
  damageCairn,
  fragmentBoxes,
  isCoreExposed,
  isWindingUp,
  phaseFor,
  slamBox,
  stepCairn,
  type Cairn,
  type CairnState,
} from './cairn.ts'

const dt = TICK_SECONDS
const CTX = { target: { x: 40, y: 200 }, groundY: 256 }

function boss(overrides: Partial<Cairn> = {}): Cairn {
  return { ...awaken(createCairn(100, 200, createRng(11))), ...overrides }
}

/** 상태가 바뀔 때까지 돌리며 방출물을 모은다. */
function run(start: Cairn, ticks: number) {
  let cairn = start
  const gravestones: unknown[] = []
  const rocks: unknown[] = []
  const ghouls: unknown[] = []
  const states: CairnState[] = []
  let quakes = 0
  for (let i = 0; i < ticks; i += 1) {
    const step = stepCairn(cairn, CTX, dt)
    cairn = step.cairn
    states.push(cairn.state)
    gravestones.push(...step.emission.gravestones)
    rocks.push(...step.emission.rocks)
    ghouls.push(...step.emission.ghouls)
    if (step.emission.quake) quakes += 1
  }
  return { cairn, gravestones, rocks, ghouls, quakes, states }
}

describe('수치 — docs/05 5.4', () => {
  it('HP 300 이다', () => {
    expect(CAIRN.maxHp).toBe(300)
    expect(createCairn(0, 0, createRng(1)).hp).toBe(300)
  })

  it('크기가 docs/12.10 의 56×52 와 같다', () => {
    expect(CAIRN.width).toBe(56)
    expect(CAIRN.height).toBe(52)
  })

  it('약점 외 피격은 데미지 50% 다', () => {
    expect(CAIRN.weakPointMultiplier).toBe(0.5)
  })
})

describe('깨어남 — 보스룸에 들어와야 시작한다', () => {
  it('처음에는 자고 있다', () => {
    const sleeping = createCairn(100, 200, createRng(1))
    expect(sleeping.awake).toBe(false)
    expect(run(sleeping, 300).cairn.state).toBe('idle')
    expect(run(sleeping, 300).cairn.stateFrames).toBe(0)
  })

  it('자는 동안은 맞지 않는다', () => {
    const sleeping = createCairn(100, 200, createRng(1))
    expect(damageCairn(sleeping, 50, coreBox(sleeping)).dealt).toBe(0)
  })

  it('깨우면 시작한다', () => {
    expect(awaken(createCairn(0, 0, createRng(1))).awake).toBe(true)
  })
})

describe('약점 — 가슴의 발광 코어', () => {
  it('코어를 맞히면 전부 들어간다', () => {
    const b = boss()
    expect(damageCairn(b, 22, coreBox(b)).dealt).toBe(22)
  })

  it('다른 부위는 절반이다', () => {
    const b = boss()
    // 몸통 왼쪽 위 — 코어에서 떨어진 자리
    const shoulder = { x: b.x + 2, y: b.y + 2, width: 4, height: 4 }
    expect(damageCairn(b, 22, shoulder).dealt).toBe(11)
  })

  it('빗나가면 아무 일도 없다', () => {
    const b = boss()
    expect(damageCairn(b, 22, { x: -500, y: -500, width: 4, height: 4 }).dealt).toBe(0)
  })

  it('코어만 노리면 절반의 공격으로 잡는다', () => {
    const damage = 10
    const coreHits = Math.ceil(CAIRN.maxHp / damage)
    const bodyHits = Math.ceil(CAIRN.maxHp / (damage * CAIRN.weakPointMultiplier))
    expect(bodyHits).toBe(coreHits * 2)
  })

  it('HP 0 이면 죽는다', () => {
    const b = boss({ hp: 5 })
    const result = damageCairn(b, 10, coreBox(b))
    expect(result.killed).toBe(true)
    expect(result.cairn.state).toBe('dead')
  })

  it('죽은 뒤에는 맞지 않는다', () => {
    const dead = boss({ hp: 0, state: 'dead' })
    expect(damageCairn(dead, 10, coreBox(dead)).dealt).toBe(0)
  })
})

describe('페이즈', () => {
  it('HP 에 따라 올라간다', () => {
    expect(phaseFor(300)).toBe(1)
    expect(phaseFor(CAIRN.phase2Hp)).toBe(2)
    expect(phaseFor(CAIRN.phase3Hp)).toBe(3)
    expect(phaseFor(0)).toBe(3)
  })

  it('뒤로 갈수록 구간이 짧다 — 마무리가 늘어지지 않게', () => {
    const p1 = CAIRN.maxHp - CAIRN.phase2Hp
    const p2 = CAIRN.phase2Hp - CAIRN.phase3Hp
    const p3 = CAIRN.phase3Hp
    expect(p2).toBeLessThanOrEqual(p1)
    expect(p3).toBeLessThanOrEqual(p2)
  })

  it('데미지를 받으면 페이즈가 즉시 반영된다', () => {
    const b = boss({ hp: CAIRN.phase2Hp + 5 })
    expect(damageCairn(b, 10, coreBox(b)).cairn.phase).toBe(2)
  })

  it('페이즈 1 은 두 패턴, 3 은 네 패턴이다', () => {
    const seen = (phase: 1 | 2 | 3) => {
      const set = new Set<CairnState>()
      let rng = createRng(5)
      for (let i = 0; i < 200; i += 1) {
        const picked = chooseAttack(phase, rng)
        rng = picked.rng
        set.add(picked.state)
      }
      return set
    }
    expect(seen(1)).toEqual(new Set(['slam', 'throw']))
    expect(seen(2)).toEqual(new Set(['slam', 'throw', 'quake']))
    expect(seen(3)).toEqual(new Set(['slam', 'throw', 'quake', 'split']))
  })
})

describe('패턴 — 예비 동작이 있어야 읽힌다', () => {
  it('내려찍기 예비가 30프레임이다', () => {
    expect(CAIRN.slam.windupFrames).toBe(30)
    const b = boss({ state: 'slam', stateFrames: 0 })
    expect(isWindingUp(b)).toBe(true)
    expect(slamBox(b)).toBeNull()
  })

  it('예비가 끝나야 판정이 생기고 곧 사라진다', () => {
    const active = boss({ state: 'slam', stateFrames: CAIRN.slam.windupFrames })
    expect(slamBox(active)).not.toBeNull()
    const late = boss({
      state: 'slam',
      stateFrames: CAIRN.slam.windupFrames + CAIRN.slam.activeFrames,
    })
    expect(slamBox(late)).toBeNull()
  })

  it('판정 시간이 예비보다 훨씬 짧다 — 읽을 시간을 준다', () => {
    expect(CAIRN.slam.activeFrames).toBeLessThan(CAIRN.slam.windupFrames)
  })

  it('묘비를 2개 던진다', () => {
    const thrown = run(boss({ state: 'throw', stateFrames: 0 }), 40)
    expect(thrown.gravestones).toHaveLength(CAIRN.throwPattern.count)
  })

  it('묘비 두 개의 속도가 달라 착지점이 갈라진다 — 사이로 피한다', () => {
    const thrown = run(boss({ state: 'throw', stateFrames: 0 }), 40)
    const speeds = thrown.gravestones.map((g) => Math.abs((g as { vx: number }).vx))
    expect(new Set(speeds).size).toBe(2)
  })

  it('지면 강타는 낙석 3개와 좀비 3마리를 부른다', () => {
    const quaked = run(boss({ state: 'quake', stateFrames: 0 }), 50)
    expect(quaked.rocks).toHaveLength(3)
    expect(quaked.ghouls).toHaveLength(3)
    expect(quaked.quakes).toBe(1)
  })

  it('낙석이 벌어져 떨어진다 — 사이가 확정 회피 경로다', () => {
    const quaked = run(boss({ state: 'quake', stateFrames: 0 }), 50)
    const xs = quaked.rocks.map((r) => (r as { x: number }).x).sort((a, b) => a - b)
    expect(xs[1]! - xs[0]!).toBeGreaterThan(20)
  })

  it('패턴이 끝나면 숨을 돌린다', () => {
    const after = run(boss({ state: 'slam', stateFrames: 0 }), 200)
    expect(after.states).toContain('idle')
  })
})

describe('페이즈 3 — 분해가 곧 약점 노출이다', () => {
  it('분해 중에만 코어가 드러난다', () => {
    expect(isCoreExposed(boss({ state: 'split' }))).toBe(true)
    expect(isCoreExposed(boss({ state: 'idle' }))).toBe(false)
  })

  it('파편이 4개다 — docs/12.10 의 파츠 분할과 같다', () => {
    const split = run(boss({ state: 'split', stateFrames: 0, phase: 3 }), 40)
    expect(split.cairn.fragments).toHaveLength(CAIRN.split.fragmentCount)
    expect(fragmentBoxes(split.cairn)).toHaveLength(4)
  })

  it('파편이 플레이어를 쫓는다', () => {
    let c = run(boss({ state: 'split', stateFrames: 0, phase: 3 }), 40).cairn
    const before = c.fragments.map((f) => Math.hypot(f.x - CTX.target.x, f.y - CTX.target.y))
    for (let i = 0; i < 90; i += 1) c = stepCairn(c, CTX, dt).cairn
    const after = c.fragments.map((f) => Math.hypot(f.x - CTX.target.x, f.y - CTX.target.y))
    expect(after.filter((d, i) => d < before[i]!).length).toBeGreaterThanOrEqual(3)
  })

  it('파편이 느리다 — 넷을 동시에 피할 수 있어야 한다', () => {
    let c = run(boss({ state: 'split', stateFrames: 0, phase: 3 }), 60).cairn
    for (let i = 0; i < 60; i += 1) c = stepCairn(c, CTX, dt).cairn
    const player = loadBalance().player
    for (const f of c.fragments) {
      expect(Math.hypot(f.vx, f.vy)).toBeLessThan(player.runSpeed)
    }
  })

  it('시간이 지나면 재결합한다', () => {
    const total = CAIRN.split.windupFrames + CAIRN.split.chaseFrames + CAIRN.split.mergeFrames
    const after = run(boss({ state: 'split', stateFrames: 0, phase: 3 }), total + 10)
    expect(after.states).toContain('merge')
    expect(after.cairn.fragments).toEqual([])
  })
})

describe('상자', () => {
  it('코어가 몸통 안에 있다', () => {
    const b = boss()
    const core = coreBox(b)
    const body = bodyBox(b)
    expect(core.x).toBeGreaterThan(body.x)
    expect(core.x + core.width).toBeLessThan(body.x + body.width)
  })

  it('플레이어를 바라본다', () => {
    const b = boss()
    const left = stepCairn(b, { ...CTX, target: { x: 0, y: 200 } }, dt).cairn
    const right = stepCairn(b, { ...CTX, target: { x: 999, y: 200 } }, dt).cairn
    expect(left.facing).toBe(-1)
    expect(right.facing).toBe(1)
  })
})
