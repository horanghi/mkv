import { describe, expect, it } from 'vitest'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/config.ts'
import { CAMERA, createCamera, snapCamera, stepCamera, viewOf, type CameraTarget } from './camera.ts'

const BOUNDS = { width: 2000, height: 400 }
const still = (x: number, y: number): CameraTarget => ({ x, y, facing: 0, falling: false })

function settle(target: CameraTarget, ticks = 200) {
  let cam = createCamera()
  for (let i = 0; i < ticks; i += 1) cam = stepCamera(cam, target, BOUNDS)
  return cam
}

describe('데드존', () => {
  it('데드존 안에서는 움직이지 않는다 — 작은 움직임마다 배경이 흔들리면 눈이 피로하다', () => {
    const center = { x: LOGICAL_WIDTH / 2, y: LOGICAL_HEIGHT / 2 }
    const cam = createCamera()
    const nudged = stepCamera(cam, still(center.x + 20, center.y + 10), BOUNDS)
    expect(nudged.x).toBeCloseTo(cam.x)
    expect(nudged.y).toBeCloseTo(cam.y)
  })

  it('데드존을 벗어나면 따라간다', () => {
    const cam = stepCamera(createCamera(), still(600, 135), BOUNDS)
    expect(cam.x).toBeGreaterThan(0)
  })

  it('결국 목표를 데드존 안에 담는다', () => {
    const cam = settle(still(800, 200))
    const centerX = cam.x + LOGICAL_WIDTH / 2
    expect(Math.abs(800 - centerX)).toBeLessThanOrEqual(CAMERA.deadzoneWidth / 2 + 1)
  })
})

describe('선행', () => {
  it('이동 방향을 더 넓게 보여준다', () => {
    const right = settle({ x: 800, y: 200, facing: 1, falling: false })
    const left = settle({ x: 800, y: 200, facing: -1, falling: false })
    // 좌우로 각각 32px 씩 — 합쳐서 64px 차이다. 데드존과 곱해지면 안 된다.
    expect(right.x - left.x).toBeCloseTo(CAMERA.lookAhead * 2, 0)
    const neutral = settle({ x: 800, y: 200, facing: 0, falling: false })
    expect(right.x - neutral.x).toBeCloseTo(CAMERA.lookAhead, 0)
  })
})

describe('낙하 — 착지점을 미리 보여준다', () => {
  it('떨어지는 동안 세로 데드존이 넓어진다', () => {
    // 카메라가 곧바로 따라 내려가면 어디에 떨어질지 알 수 없다.
    const target = { x: 240, y: 200, facing: 0 }
    const walking = stepCamera(createCamera(), { ...target, falling: false }, BOUNDS)
    const falling = stepCamera(createCamera(), { ...target, falling: true }, BOUNDS)
    expect(falling.y).toBeLessThan(walking.y)
  })
})

describe('경계', () => {
  it('맵 밖으로 나가지 않는다', () => {
    expect(settle(still(-500, -500)).x).toBe(0)
    expect(settle(still(-500, -500)).y).toBe(0)
    const far = settle(still(99999, 99999))
    expect(far.x).toBe(BOUNDS.width - LOGICAL_WIDTH)
    expect(far.y).toBe(BOUNDS.height - LOGICAL_HEIGHT)
  })

  it('맵이 화면보다 작으면 0 에 붙는다', () => {
    const tiny = { width: 100, height: 100 }
    expect(stepCamera(createCamera(), still(50, 50), tiny)).toMatchObject({ x: 0, y: 0 })
  })
})

describe('즉시 이동', () => {
  it('리스폰은 보간하지 않는다 — 3초 예산을 먹는다', () => {
    const snapped = snapCamera(still(800, 200), BOUNDS)
    expect(snapped.x).toBe(800 - LOGICAL_WIDTH / 2)
  })

  it('즉시 이동도 경계를 지킨다', () => {
    expect(snapCamera(still(0, 0), BOUNDS)).toMatchObject({ x: 0, y: 0, lead: 0 })
  })
})

describe('가시 영역', () => {
  it('논리 해상도만큼 본다 — 그림의 화면 안 판정에 쓴다', () => {
    expect(viewOf({ x: 100, y: 50, lead: 0 })).toEqual({
      x: 100, y: 50, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT,
    })
  })
})
