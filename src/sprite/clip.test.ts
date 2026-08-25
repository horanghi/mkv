import { describe, expect, it } from 'vitest'
import {
  ATTACK_RELEASE_FRAME,
  CLIPS,
  CLIP_NAMES,
  advanceClip,
  currentPose,
  frameDurationMs,
  jumpFrame,
  playClip,
  releasesProjectile,
  startClip,
  type ClipName,
  type ClipState,
} from './clip.ts'

function run(state: ClipState, ticks: number, dtMs = 1000 / 60): ClipState {
  let current = state
  for (let i = 0; i < ticks; i += 1) current = advanceClip(current, dtMs)
  return current
}

describe('클립 데이터', () => {
  it('여덟 종이 있고 전부 프레임을 갖는다', () => {
    expect(CLIP_NAMES).toHaveLength(8)
    for (const name of CLIP_NAMES) {
      expect(CLIPS[name].keys.length).toBeGreaterThan(0)
      expect(CLIPS[name].fps).toBeGreaterThan(0)
    }
  })

  it('docs/12 의 프레임 수와 같다', () => {
    const counts: Record<ClipName, number> = {
      idle: 2, walk: 8, jump: 4, attack: 4, crouch: 2, land: 3, hurt: 3, ladder: 4,
    }
    for (const [name, n] of Object.entries(counts)) {
      expect(CLIPS[name as ClipName].keys).toHaveLength(n)
    }
  })

  it('무기는 attack 클립에만 붙어 있다', () => {
    for (const name of CLIP_NAMES) {
      const hasWeapon = CLIPS[name].keys.some((k) => k.wpn !== undefined)
      expect(hasWeapon).toBe(name === 'attack')
    }
  })
})

describe('재생', () => {
  it('fps 대로 프레임이 넘어간다', () => {
    // walk 는 12fps — 5틱(83ms)마다 한 프레임
    const start = startClip('walk')
    expect(frameDurationMs(CLIPS.walk)).toBeCloseTo(83.3, 1)
    expect(run(start, 5).frame).toBe(1)
    expect(run(start, 10).frame).toBe(2)
  })

  it('반복 클립은 처음으로 돌아온다', () => {
    const state = run(startClip('walk'), 5 * 8)
    expect(state.frame).toBe(0)
    expect(state.finished).toBe(false)
  })

  it('한 번에 여러 프레임을 건너뛴다 — 프레임이 밀려도 속도가 느려지지 않는다', () => {
    const jumped = advanceClip(startClip('walk'), 1000 / 12 * 3)
    expect(jumped.frame).toBe(3)
  })

  it('반복하지 않는 클립은 마지막 프레임에서 멈춘다', () => {
    const state = run(startClip('hurt'), 60)
    expect(state.frame).toBe(CLIPS.hurt.keys.length - 1)
    expect(state.finished).toBe(true)
    // 더 돌려도 그대로다
    expect(run(state, 60).frame).toBe(state.frame)
  })

  it('시간이 모자라면 프레임을 유지하고 누적만 한다', () => {
    const state = advanceClip(startClip('walk'), 10)
    expect(state.frame).toBe(0)
    expect(state.elapsedMs).toBe(10)
    expect(state.advanced).toBe(false)
  })

  it('음수 시간은 무시한다', () => {
    expect(advanceClip(startClip('walk'), -100).elapsedMs).toBe(0)
  })
})

describe('상태 전환 — 프레임 인덱스가 튀지 않는다', () => {
  it('같은 클립을 다시 요청해도 되감기지 않는다', () => {
    // 호출부가 매 틱 play(state,'walk') 를 부르는 것이 자연스럽다.
    // 그때마다 0 으로 되돌리면 걷기가 첫 프레임에 얼어붙는다.
    const mid = run(startClip('walk'), 12)
    expect(mid.frame).toBe(2)
    expect(playClip(mid, 'walk')).toBe(mid)
  })

  it('매 틱 같은 클립을 요청해도 재생 결과가 같다', () => {
    let withPlay = startClip('walk')
    for (let i = 0; i < 40; i += 1) {
      withPlay = playClip(withPlay, 'walk')
      withPlay = advanceClip(withPlay, 1000 / 60)
    }
    expect(withPlay).toEqual(run(startClip('walk'), 40))
  })

  it('다른 클립으로 바꾸면 처음부터 시작한다', () => {
    const mid = run(startClip('walk'), 12)
    const jumped = playClip(mid, 'jump')
    expect(jumped.name).toBe('jump')
    expect(jumped.frame).toBe(0)
  })

  it('갑옷 상태는 재생 상태에 들어 있지 않다 — 구조적으로 프레임이 흔들릴 수 없다', () => {
    const mid = run(startClip('walk'), 12)
    expect(Object.keys(mid).sort()).toEqual(
      ['advanced', 'elapsedMs', 'finished', 'frame', 'name'].sort(),
    )
  })
})

describe('점프 — 물리가 프레임을 고른다', () => {
  it('시간으로는 넘어가지 않는다', () => {
    const state = run(startClip('jump'), 120)
    expect(state.frame).toBe(0)
    expect(state.advanced).toBe(false)
  })

  it('속도로 프레임을 고른다', () => {
    expect(jumpFrame(-420)).toBe(1) // 도약
    expect(jumpFrame(0)).toBe(2)    // 정점
    expect(jumpFrame(480)).toBe(3)  // 하강
  })
})

describe('투사체 신호', () => {
  it('attack 2프레임에서 놓는다 — docs/02 발사 딜레이와 맞춘 타이밍', () => {
    expect(ATTACK_RELEASE_FRAME).toBe(1)

    let state = startClip('attack')
    const releases: number[] = []
    for (let i = 0; i < 40; i += 1) {
      state = advanceClip(state, 1000 / 60)
      if (releasesProjectile(state)) releases.push(state.frame)
    }
    expect(releases).toEqual([ATTACK_RELEASE_FRAME])
  })

  it('다른 클립은 투사체를 놓지 않는다', () => {
    let state = startClip('walk')
    for (let i = 0; i < 60; i += 1) {
      state = advanceClip(state, 1000 / 60)
      expect(releasesProjectile(state)).toBe(false)
    }
  })
})

describe('현재 포즈', () => {
  it('프레임에 해당하는 포즈를 준다', () => {
    expect(currentPose(startClip('walk'))).toBe(CLIPS.walk.keys[0])
    expect(currentPose(run(startClip('walk'), 5))).toBe(CLIPS.walk.keys[1])
  })

  it('프레임이 범위를 넘어도 마지막 포즈로 잘린다', () => {
    const broken: ClipState = { ...startClip('idle'), frame: 99 }
    expect(currentPose(broken)).toBe(CLIPS.idle.keys[1])
  })
})
