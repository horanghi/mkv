import { describe, expect, it } from 'vitest'
import { startClip, type ClipState } from '../../sprite/clip.ts'
import { loadBalance } from '../../data/load.ts'
import { createBody } from '../../physics/body.ts'
import { IDLE_ATTACK } from './attack.ts'
import { NO_TIMERS } from './jump.ts'
import { frameFor, nextClip } from './animation.ts'
import type { Player } from './player.ts'

const balance = loadBalance().player

function make(overrides: Partial<Player> = {}, body: Partial<Player['body']> = {}): Player {
  return {
    body: { ...createBody(0, 0, balance.hitbox.width, balance.hitbox.height), onGround: true, ...body },
    state: 'idle',
    facing: 1,
    timers: NO_TIMERS,
    attack: IDLE_ATTACK,
    crouching: false,
    jumped: false,
    landed: false,
    ...overrides,
  }
}

const idle: ClipState = startClip('idle')

describe('클립 선택', () => {
  it('가만히 서 있으면 대기', () => {
    expect(nextClip(make(), idle)).toBe('idle')
  })

  it('움직이면 걷기', () => {
    expect(nextClip(make({}, { vx: 110 }), idle)).toBe('walk')
    expect(nextClip(make({}, { vx: -110 }), idle)).toBe('walk')
  })

  it('아주 느린 미끄러짐은 걷기가 아니다', () => {
    expect(nextClip(make({}, { vx: 0.5 }), idle)).toBe('idle')
  })

  it('공중이면 점프', () => {
    expect(nextClip(make({}, { onGround: false, vx: 110 }), idle)).toBe('jump')
  })

  it('웅크리면 웅크리기', () => {
    expect(nextClip(make({ crouching: true }), idle)).toBe('crouch')
  })

  it('착지한 틱에 착지 클립으로 넘어간다', () => {
    expect(nextClip(make({ landed: true }), idle)).toBe('land')
  })
})

describe('우선순위', () => {
  it('공격이 이동보다 위다 — 후딜 중에도 이동이 되기 때문', () => {
    const attacking = make({ attack: { ...IDLE_ATTACK, recovery: 5 } }, { vx: 110 })
    expect(nextClip(attacking, idle)).toBe('attack')
  })

  it('공격이 공중보다 위다', () => {
    const airAttack = make({ attack: { ...IDLE_ATTACK, startup: 2 } }, { onGround: false })
    expect(nextClip(airAttack, idle)).toBe('attack')
  })

  it('공중이 착지보다 위다 — 착지 도중 다시 떨어지면 점프로 돌아간다', () => {
    const falling = make({ landed: true }, { onGround: false })
    expect(nextClip(falling, startClip('land'))).toBe('jump')
  })

  it('웅크리기가 걷기보다 위다', () => {
    expect(nextClip(make({ crouching: true }, { vx: 110 }), idle)).toBe('crouch')
  })
})

describe('단발 클립', () => {
  it('착지 클립은 끝날 때까지 이어진다', () => {
    const playing: ClipState = { ...startClip('land'), frame: 1, finished: false }
    expect(nextClip(make({}, { vx: 110 }), playing)).toBe('land')
  })

  it('끝나면 평소 클립으로 돌아간다', () => {
    const done: ClipState = { ...startClip('land'), frame: 2, finished: true }
    expect(nextClip(make({}, { vx: 110 }), done)).toBe('walk')
    expect(nextClip(make(), done)).toBe('idle')
  })
})

describe('프레임 선택', () => {
  it('점프는 물리가 고른다', () => {
    const jump = startClip('jump')
    expect(frameFor(make({}, { onGround: false, vy: -420 }), jump)).toBe(1)
    expect(frameFor(make({}, { onGround: false, vy: 0 }), jump)).toBe(2)
    expect(frameFor(make({}, { onGround: false, vy: 480 }), jump)).toBe(3)
  })

  it('다른 클립은 재생 상태를 그대로 쓴다', () => {
    const walking: ClipState = { ...startClip('walk'), frame: 5 }
    expect(frameFor(make({}, { vx: 110 }), walking)).toBe(5)
  })
})

describe('피격 우선순위', () => {
  it('피격 클립은 무엇도 끊지 못한다 — 맞았다는 사실이 가장 먼저 읽혀야 한다', () => {
    const hurting: ClipState = { ...startClip('hurt'), frame: 1, finished: false }
    // 공격 중이어도, 공중이어도, 웅크려도 피격이 이긴다
    expect(nextClip(make({ attack: { ...IDLE_ATTACK, startup: 2 } }), hurting)).toBe('hurt')
    expect(nextClip(make({}, { onGround: false }), hurting)).toBe('hurt')
    expect(nextClip(make({ crouching: true }), hurting)).toBe('hurt')
  })

  it('끝나면 평소 클립으로 돌아간다', () => {
    const done: ClipState = { ...startClip('hurt'), frame: 2, finished: true }
    expect(nextClip(make({}, { vx: 110 }), done)).toBe('walk')
  })
})
