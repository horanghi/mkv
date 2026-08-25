import { nextFloat, type RngState } from '../../core/rng.ts'
import { overlaps, type Aabb } from '../../physics/aabb.ts'

/**
 * 캐른 (Cairn) — 스테이지 1 보스. HP 300.
 *
 * 튜토리얼 보스가 가르쳐야 할 것은 "패턴을 외워라"가 아니라
 * **"뛰기 전에 읽어라"**다. 그래서 모든 패턴에 긴 예비 동작과
 * 확정 회피 경로가 있다. 느리고 크다.
 * → docs/05-enemies-bosses.md 5.4
 */

export const CAIRN = {
  maxHp: 300,
  width: 56,
  height: 52,
  /** 가슴의 발광 코어. 다른 부위는 데미지 50%. */
  core: { x: 23, y: 26, width: 10, height: 10 },
  weakPointMultiplier: 0.5,

  /**
   * 페이즈 전환 HP. 구간이 뒤로 갈수록 짧다 (110 · 100 · 90).
   *
   * 페이즈 3 은 분해 패턴이 있어 가장 위험하다. 가장 짧게 두어야
   * 긴장이 유지되고 마무리가 늘어지지 않는다.
   */
  phase2Hp: 190,
  phase3Hp: 90,

  /** 패턴 사이 숨. 이 틈이 없으면 읽을 시간이 없다. */
  idleFrames: 54,

  slam: { windupFrames: 30, activeFrames: 12, recoverFrames: 36, reach: 40 },
  throwPattern: { windupFrames: 26, count: 2, recoverFrames: 30 },
  quake: { windupFrames: 34, rockCount: 3, ghoulCount: 3, recoverFrames: 40 },
  split: { windupFrames: 30, fragmentCount: 4, chaseFrames: 240, mergeFrames: 36 },
} as const

export type CairnState =
  | 'idle' | 'slam' | 'throw' | 'quake' | 'split' | 'merge' | 'dead'

export interface CairnFragment {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  /** 재결합할 원래 오프셋 */
  readonly homeX: number
  readonly homeY: number
}

export interface Cairn {
  readonly x: number
  readonly y: number
  readonly hp: number
  readonly phase: 1 | 2 | 3
  readonly state: CairnState
  readonly stateFrames: number
  readonly facing: -1 | 1
  readonly fragments: readonly CairnFragment[]
  readonly hitFlash: number
  readonly rng: RngState
  /** 깨어났는가. 보스룸에 들어와야 시작한다. */
  readonly awake: boolean
}

/** 이번 틱에 내보낼 것들. 스폰은 호출부가 한다. */
export interface CairnEmission {
  readonly gravestones: readonly { x: number; y: number; vx: number; vy: number }[]
  readonly rocks: readonly { x: number; y: number }[]
  readonly ghouls: readonly { x: number; y: number }[]
  /** 지면 강타 — 카메라 셰이크 신호 */
  readonly quake: boolean
}

const NOTHING: CairnEmission = Object.freeze({
  gravestones: [], rocks: [], ghouls: [], quake: false,
})

export function createCairn(x: number, y: number, rng: RngState): Cairn {
  return {
    x, y,
    hp: CAIRN.maxHp,
    phase: 1,
    state: 'idle',
    stateFrames: 0,
    facing: -1,
    fragments: [],
    hitFlash: 0,
    rng,
    awake: false,
  }
}

export function bodyBox(cairn: Cairn): Aabb {
  return { x: cairn.x, y: cairn.y, width: CAIRN.width, height: CAIRN.height }
}

/** 코어는 몸통 안에 있다. 페이즈 3 분해 중에는 드러나 그대로 노출된다. */
export function coreBox(cairn: Cairn): Aabb {
  return {
    x: cairn.x + CAIRN.core.x,
    y: cairn.y + CAIRN.core.y,
    width: CAIRN.core.width,
    height: CAIRN.core.height,
  }
}

/**
 * 분해 중에는 코어가 무방비다.
 *
 * 파편 4개가 쫓아오는 동안 코어만 남는다. 파편을 피할 것인가 코어를 때릴 것인가 —
 * 튜토리얼 보스가 "뛰기 전에 읽어라"를 처음 강제하는 구간이다.
 * → docs/12-sprites.md 12.10
 */
export function isCoreExposed(cairn: Cairn): boolean {
  return cairn.state === 'split'
}

export interface CairnDamage {
  readonly cairn: Cairn
  readonly dealt: number
  readonly killed: boolean
}

/** 코어를 맞히면 전부, 다른 부위는 절반이다. */
export function damageCairn(cairn: Cairn, amount: number, box: Aabb): CairnDamage {
  if (cairn.state === 'dead' || !cairn.awake) {
    return { cairn, dealt: 0, killed: false }
  }
  const hitCore = overlaps(box, coreBox(cairn))
  if (!hitCore && !overlaps(box, bodyBox(cairn))) {
    return { cairn, dealt: 0, killed: false }
  }

  const dealt = Math.round(amount * (hitCore ? 1 : CAIRN.weakPointMultiplier))
  const hp = Math.max(0, cairn.hp - dealt)
  const killed = hp === 0

  return {
    cairn: {
      ...cairn,
      hp,
      hitFlash: 2,
      state: killed ? 'dead' : cairn.state,
      phase: phaseFor(hp),
    },
    dealt,
    killed,
  }
}

export function phaseFor(hp: number): 1 | 2 | 3 {
  if (hp <= CAIRN.phase3Hp) return 3
  if (hp <= CAIRN.phase2Hp) return 2
  return 1
}

export interface CairnContext {
  readonly target: { readonly x: number; readonly y: number }
  readonly groundY: number
}

export interface CairnStep {
  readonly cairn: Cairn
  readonly emission: CairnEmission
}

export function stepCairn(cairn: Cairn, ctx: CairnContext, dt: number): CairnStep {
  if (!cairn.awake || cairn.state === 'dead') {
    return { cairn: { ...cairn, hitFlash: Math.max(0, cairn.hitFlash - 1) }, emission: NOTHING }
  }

  const facing: -1 | 1 = ctx.target.x < cairn.x + CAIRN.width / 2 ? -1 : 1
  const base = { ...cairn, facing, hitFlash: Math.max(0, cairn.hitFlash - 1) }

  switch (cairn.state) {
    case 'idle': return stepIdle(base)
    case 'slam': return stepTimed(base, CAIRN.slam.windupFrames + CAIRN.slam.activeFrames + CAIRN.slam.recoverFrames)
    case 'throw': return stepThrow(base, ctx)
    case 'quake': return stepQuake(base, ctx)
    case 'split': return stepSplit(base, ctx, dt)
    case 'merge': return stepTimed(base, CAIRN.split.mergeFrames)
    default: return { cairn: base, emission: NOTHING }
  }
}

/** 다음 패턴을 고른다. 페이즈가 오를수록 선택지가 늘어난다. */
export function chooseAttack(phase: 1 | 2 | 3, rng: RngState): { state: CairnState; rng: RngState } {
  const pool: CairnState[] = ['slam', 'throw']
  if (phase >= 2) pool.push('quake')
  if (phase >= 3) pool.push('split')

  const draw = nextFloat(rng)
  return { state: pool[Math.floor(draw.value * pool.length)] ?? 'slam', rng: draw.state }
}

function stepIdle(cairn: Cairn): CairnStep {
  const frames = cairn.stateFrames + 1
  if (frames < CAIRN.idleFrames) {
    return { cairn: { ...cairn, stateFrames: frames }, emission: NOTHING }
  }
  const picked = chooseAttack(cairn.phase, cairn.rng)
  return {
    cairn: { ...cairn, state: picked.state, stateFrames: 0, rng: picked.rng },
    emission: NOTHING,
  }
}

function stepTimed(cairn: Cairn, total: number): CairnStep {
  const frames = cairn.stateFrames + 1
  if (frames < total) return { cairn: { ...cairn, stateFrames: frames }, emission: NOTHING }
  return { cairn: { ...cairn, state: 'idle', stateFrames: 0, fragments: [] }, emission: NOTHING }
}

/** 묘비 투척 — 포물선 2개. 착지점이 갈라져 있어 사이로 피할 수 있다. */
function stepThrow(cairn: Cairn, ctx: CairnContext): CairnStep {
  const frames = cairn.stateFrames + 1
  const spec = CAIRN.throwPattern

  if (frames === spec.windupFrames) {
    const originX = cairn.x + CAIRN.width / 2
    const originY = cairn.y + 12
    const gravestones = Array.from({ length: spec.count }, (_, i) => ({
      x: originX,
      y: originY,
      vx: cairn.facing * (110 + i * 55),
      vy: -170,
    }))
    return { cairn: { ...cairn, stateFrames: frames }, emission: { ...NOTHING, gravestones } }
  }

  if (frames >= spec.windupFrames + spec.recoverFrames) {
    return { cairn: { ...cairn, state: 'idle', stateFrames: 0 }, emission: NOTHING }
  }
  void ctx
  return { cairn: { ...cairn, stateFrames: frames }, emission: NOTHING }
}

/** 지면 강타 — 낙석 3개와 좀비 3마리. 낙석 사이가 확정 회피 경로다. */
function stepQuake(cairn: Cairn, ctx: CairnContext): CairnStep {
  const frames = cairn.stateFrames + 1
  const spec = CAIRN.quake

  if (frames === spec.windupFrames) {
    const spread = CAIRN.width * 2
    const left = cairn.x + CAIRN.width / 2 - spread / 2
    const rocks = Array.from({ length: spec.rockCount }, (_, i) => ({
      x: left + (spread / (spec.rockCount - 1)) * i,
      y: ctx.groundY - 200,
    }))
    const ghouls = Array.from({ length: spec.ghoulCount }, (_, i) => ({
      x: cairn.x + 8 + i * 20,
      y: ctx.groundY - 22,
    }))
    return {
      cairn: { ...cairn, stateFrames: frames },
      emission: { gravestones: [], rocks, ghouls, quake: true },
    }
  }

  if (frames >= spec.windupFrames + spec.recoverFrames) {
    return { cairn: { ...cairn, state: 'idle', stateFrames: 0 }, emission: NOTHING }
  }
  return { cairn: { ...cairn, stateFrames: frames }, emission: NOTHING }
}

/**
 * 몸통 분해 — 파편 4개가 개별 추적한다.
 *
 * 분해되는 순간 코어가 드러난다. 위험을 감수하고 때릴 것인가.
 */
function stepSplit(cairn: Cairn, ctx: CairnContext, dt: number): CairnStep {
  const frames = cairn.stateFrames + 1
  const spec = CAIRN.split

  if (frames === spec.windupFrames) {
    const fragments = makeFragments(cairn)
    return { cairn: { ...cairn, stateFrames: frames, fragments }, emission: NOTHING }
  }

  if (frames < spec.windupFrames) {
    return { cairn: { ...cairn, stateFrames: frames }, emission: NOTHING }
  }

  if (frames >= spec.windupFrames + spec.chaseFrames) {
    return { cairn: { ...cairn, state: 'merge', stateFrames: 0 }, emission: NOTHING }
  }

  // 파편이 각자 플레이어를 향한다. 느리다 — 넷을 동시에 피할 수 있어야 한다.
  const fragments = cairn.fragments.map((f) => {
    const dx = ctx.target.x - f.x
    const dy = ctx.target.y - f.y
    const length = Math.hypot(dx, dy) || 1
    const speed = 58
    const vx = f.vx + ((dx / length) * speed - f.vx) * 0.06
    const vy = f.vy + ((dy / length) * speed - f.vy) * 0.06
    return { ...f, x: f.x + vx * dt, y: f.y + vy * dt, vx, vy }
  })

  return { cairn: { ...cairn, stateFrames: frames, fragments }, emission: NOTHING }
}

/** 파편 4개 — 머리·양팔·기단. 파츠 분할이 곧 이 패턴이다. → docs/12.10 */
function makeFragments(cairn: Cairn): readonly CairnFragment[] {
  const offsets = [
    { x: 18, y: 5 },   // 머리
    { x: 2, y: 21 },   // 뒷팔
    { x: 42, y: 21 },  // 앞팔
    { x: 0, y: 36 },   // 기단
  ]
  return offsets.map((o) => ({
    x: cairn.x + o.x,
    y: cairn.y + o.y,
    vx: 0,
    vy: 0,
    homeX: o.x,
    homeY: o.y,
  }))
}

/** 파편 히트박스. 각각 판정 단위다. */
export function fragmentBoxes(cairn: Cairn): readonly Aabb[] {
  return cairn.fragments.map((f) => ({ x: f.x, y: f.y, width: 14, height: 14 }))
}

/** 보스룸에 들어오면 깨어난다. */
export function awaken(cairn: Cairn): Cairn {
  if (cairn.awake) return cairn
  return { ...cairn, awake: true, state: 'idle', stateFrames: 0 }
}

/** 예비 동작 중인가. 실루엣이 달라져야 읽힌다. */
export function isWindingUp(cairn: Cairn): boolean {
  switch (cairn.state) {
    case 'slam': return cairn.stateFrames < CAIRN.slam.windupFrames
    case 'throw': return cairn.stateFrames < CAIRN.throwPattern.windupFrames
    case 'quake': return cairn.stateFrames < CAIRN.quake.windupFrames
    case 'split': return cairn.stateFrames < CAIRN.split.windupFrames
    default: return false
  }
}

/** 내려찍기 판정 상자. 예비 30프레임 뒤 12프레임만 살아 있다. */
export function slamBox(cairn: Cairn): Aabb | null {
  if (cairn.state !== 'slam') return null
  const { windupFrames, activeFrames, reach } = CAIRN.slam
  if (cairn.stateFrames < windupFrames) return null
  if (cairn.stateFrames >= windupFrames + activeFrames) return null

  const x = cairn.facing === 1 ? cairn.x + CAIRN.width : cairn.x - reach
  return { x, y: cairn.y + CAIRN.height - 24, width: reach, height: 24 }
}
