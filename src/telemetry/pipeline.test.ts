import { describe, expect, it } from 'vitest'
import { INITIAL_INPUT, advanceInput, frameOf, type Action, type InputState } from '../core/input.ts'
import { loadBalance } from '../data/load.ts'
import { STAGE_1 } from '../data/stages/stage1.ts'
import { createWorld, stepWorld, type World } from '../game/world.ts'
import { EMPTY_TALLY, tally } from './frameTally.ts'
import { toPayload } from './payload.ts'
import { NEW_RECORDER, record, type RecorderState } from './recorder.ts'
import { GATE } from './report.ts'
import { retryRate } from './session.ts'

/**
 * 계측 배선을 통째로 돌린다 — 실제 월드 → 프레임 접기 → 기록기 → 꾸러미.
 *
 * 조각은 저마다 테스트가 있지만, **이어 붙인 것을 실제 플레이로 돌려 본 적이
 * 없었다.** 게이트가 읽는 여섯 숫자가 전부 이 사슬을 지나가므로, 어디 한
 * 마디가 틀리면 테스터 다섯의 기록이 통째로 거짓이 된다. 그런데 그 거짓은
 * 조각 테스트를 전부 통과한 채로 나타난다.
 *
 * → prompts/m1-gate.md "추측하지 말고 계측한다"
 */

/** 60Hz 한 틱. */
const TICK_MS = 1000 / 60

interface Played {
  readonly state: RecorderState
  readonly deaths: number
  readonly elapsedMs: number
}

/**
 * 죽을 줄 아는 봇으로 스테이지를 달린다.
 *
 * `retryAfterMs` 는 죽고 나서 다시 입력하기까지 기다리는 시간이다. 게이트의
 * 재시도 판정이 이 값에 반응해야 한다 — 안 하면 재시도율은 숫자만 그럴듯한
 * 상수가 된다.
 */
function play(frames: number, retryAfterMs: number, ticksPerFrame = 1): Played {
  const balance = loadBalance()
  let world: World = createWorld(STAGE_1, balance)
  let input: InputState = INITIAL_INPUT
  let state = NEW_RECORDER
  let elapsedMs = 0
  let deaths = 0
  // 죽은 시각 + 대기 시간. **부활했다고 풀지 않는다** — 풀면 부활하자마자
  // 손이 돌아가 버려서 아무리 오래 기다리게 해도 늘 즉시 재시도가 된다.
  let resumeAtMs = 0

  const frameMs = TICK_MS * ticksPerFrame

  for (let frame = 0; frame < frames; frame += 1) {
    elapsedMs += frameMs

    // 죽고 나면 정해진 시간이 지나야 다시 손을 댄다.
    const waiting = elapsedMs < resumeAtMs
    const actions: Action[] = waiting ? [] : ['right']
    const pressed = actions.length > 0

    // 한 프레임 안의 틱을 전부 돌려 하나로 접는다. 실제 배선과 같다.
    let folded = EMPTY_TALLY
    for (let t = 0; t < ticksPerFrame; t += 1) {
      const deadBefore = world.vitals.dead
      input = advanceInput(input, frameOf(...actions))
      const result = stepWorld(world, input, balance)
      world = result.world
      input = result.input
      folded = tally(folded, result.events, deadBefore, world.vitals.dead)
      if (result.events.died) { deaths += 1; resumeAtMs = elapsedMs + retryAfterMs }
    }

    state = record(state, {
      nowMs: elapsedMs,
      frameMs,
      dead: world.vitals.dead,
      playerX: world.player.body.x,
      cleared: world.cleared,
      bossAwake: world.cairn.awake,
      pressed,
      respawned: folded.respawned,
      died: folded.died,
      hurt: folded.hurt,
      armorBroke: folded.armorBroke,
      cause: folded.cause,
    })
  }
  return { state, deaths, elapsedMs }
}

describe('계측 배선 — 실제 플레이가 게이트 숫자로 맺히는가', () => {
  // 죽자마자 다시 붙는 플레이어. 재시도 창(3초) 안이다.
  const eager = play(60 * 90, 200)

  it('봇이 실제로 죽는다 — 안 죽으면 아래가 전부 빈 통과다', () => {
    expect(eager.deaths).toBeGreaterThan(0)
  })

  it('월드가 낸 사망 수와 세션이 센 사망 수가 같다', () => {
    expect(eager.state.session.deaths.length).toBe(eager.deaths)
  })

  it('사망 지점이 실제 맵 안이다 — 좌표가 새면 구간 진단이 거짓이 된다', () => {
    const mapWidthPx = STAGE_1.map.width * STAGE_1.map.tileSize
    for (const death of eager.state.session.deaths) {
      expect(death.x).toBeGreaterThanOrEqual(0)
      expect(death.x).toBeLessThanOrEqual(mapWidthPx)
    }
  })

  it('모든 사망에 사인이 붙는다 — "무엇에 죽었는지" 가 진단의 절반이다', () => {
    const unknown = eager.state.session.deaths.filter((d) => d.cause === null)
    expect({ 사인없는사망: unknown.length }).toEqual({ 사인없는사망: 0 })
  })

  it('프레임이 모인다 — 60fps 항목은 이게 없으면 판정 불가다', () => {
    expect(eager.state.session.frames.samples).toBeGreaterThan(0)
  })

  it('바로 다시 붙으면 재시도로 잡힌다', () => {
    // 마지막 하나는 아직 판정 중일 수 있으므로 뺀다.
    const judged = eager.state.session.deaths.filter((d) => d.retried !== null)
    expect(judged.length).toBeGreaterThan(0)
    expect(retryRate(eager.state.session)).toBeGreaterThanOrEqual(GATE.retryRate)
  })

  it('손을 떼고 있으면 이탈로 잡힌다 — 재시도율이 상수가 아니다', () => {
    // 같은 봇이 재시도 창(3초)을 넘겨 기다리면 판정이 뒤집혀야 한다.
    const idle = play(60 * 90, 5000)
    expect(idle.deaths).toBeGreaterThan(0)
    expect(retryRate(idle.state.session)).toBeLessThan(retryRate(eager.state.session))
  })

  it('꾸러미가 세션과 어긋나지 않는다', () => {
    const payload = toPayload(eager.state.session, 640_000)

    expect(payload.deaths).toBe(eager.state.session.deaths.length)
    expect(payload.v).toBe(eager.state.session.version)
    expect(payload.diff).toBe(eager.state.session.difficulty)
    // 사인 합계가 사망 수를 넘지 않는다. 넘으면 어딘가에서 두 번 셌다는 뜻이다.
    const counted = Object.values(payload.causes).reduce((a, b) => a + b, 0)
    expect(counted).toBeLessThanOrEqual(payload.deaths)
  })

  it('사망 구간 합계가 사망 수와 같다 — 구간 진단이 사망을 흘리면 안 된다', () => {
    const payload = toPayload(eager.state.session, null)
    const inSpots = payload.hotspots.reduce((sum, [, n]) => sum + n, 0)
    expect(inSpots).toBe(payload.deaths)
  })

  it('한 프레임에 틱이 여러 개여도 사망 수와 재시도가 살아남는다', () => {
    // 느린 기계에서는 한 프레임에 틱이 여러 개 돈다. 테스터가 중급 노트북에서
    // 돌린다는 게 게이트의 전제이므로, 프레임이 밀려도 숫자가 같아야 한다.
    //
    // **부활 틱과 사망 틱이 같은 프레임에 드는 경우는 여기서 재현되지 않는다.**
    // 실제로 재 보니 틱/프레임 1·4·8 어디서도 한 번도 나지 않았다 — 부활 뒤
    // 무적 시간이 있어 몇 틱 안에 다시 죽을 수가 없다. 그 경우는 관측값을
    // 직접 넣는 `recorder.test.ts` 가 따로 못박는다.
    const chunky = play(60 * 90, 200, 4)

    expect(chunky.deaths).toBeGreaterThan(0)
    expect(chunky.state.session.deaths.length).toBe(chunky.deaths)
    expect(retryRate(chunky.state.session)).toBeGreaterThanOrEqual(GATE.retryRate)
  })
})
