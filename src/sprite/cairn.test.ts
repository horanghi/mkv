import { describe, expect, it } from 'vitest'
import { CAIRN } from '../entities/bosses/cairn.ts'
import {
  CAIRN_HEIGHT, CAIRN_OFFSETS, CAIRN_PARTS, CAIRN_WIDTH, FRAGMENT_PARTS,
  PAL_CAIRN, cairnFrame, cairnPose, fragmentFrame,
} from './cairn.ts'
import { heightOf, widthOf } from './matrix.ts'
import { missingIndices } from './palette.ts'

describe('캐른 도트', () => {
  it('조립된 프레임이 히트박스와 같은 크기다', () => {
    const frame = cairnFrame()
    expect(widthOf(frame)).toBe(CAIRN_WIDTH)
    expect(heightOf(frame)).toBe(CAIRN_HEIGHT)
    expect([CAIRN_WIDTH, CAIRN_HEIGHT]).toEqual([CAIRN.width, CAIRN.height])
  })

  it('모든 파츠가 팔레트 안의 색만 쓴다', () => {
    for (const [name, part] of Object.entries(CAIRN_PARTS)) {
      expect([name, missingIndices(part, PAL_CAIRN)]).toEqual([name, []])
    }
  })

  it('파츠가 캔버스를 벗어나지 않는다 — 벗어나면 잘려서 실루엣이 깨진다', () => {
    const fits: readonly [string, keyof typeof CAIRN_PARTS, readonly [number, number]][] = [
      ['BASE', 'BASE', CAIRN_OFFSETS.BASE],
      ['TORSO', 'TORSO', CAIRN_OFFSETS.TORSO],
      ['HEAD', 'HEAD', CAIRN_OFFSETS.HEAD],
      ['ARM_B', 'ARM_BACK', CAIRN_OFFSETS.ARM_B],
      ['ARM_F', 'ARM', CAIRN_OFFSETS.ARM_F],
      ['CORE', 'CORE', CAIRN_OFFSETS.CORE],
    ]
    for (const [label, part, [x, y]] of fits) {
      expect([label, x + widthOf(CAIRN_PARTS[part]) <= CAIRN_WIDTH]).toEqual([label, true])
      expect([label, y + heightOf(CAIRN_PARTS[part]) <= CAIRN_HEIGHT]).toEqual([label, true])
    }
  })

  it('코어 오프셋이 판정 코어와 같다 — 어긋나면 보이는 곳과 맞는 곳이 다르다', () => {
    expect([CAIRN_OFFSETS.CORE[0], CAIRN_OFFSETS.CORE[1]]).toEqual([CAIRN.core.x, CAIRN.core.y])
    expect(widthOf(CAIRN_PARTS.CORE)).toBe(CAIRN.core.width)
    expect(heightOf(CAIRN_PARTS.CORE)).toBe(CAIRN.core.height)
  })

  it('분해 상태는 코어만 남는다 — 약점 노출이 곧 분해다', () => {
    const whole = cairnFrame()
    const split = cairnFrame({ coreOnly: true })
    const painted = (m: readonly string[]) => m.join('').split('').filter((c) => c !== '.').length

    expect(painted(split)).toBeLessThan(painted(whole) / 4)
    expect(painted(split)).toBeGreaterThan(0)
  })

  it('포즈가 실제로 프레임을 바꾼다', () => {
    expect(cairnFrame({ dy: 1 })).not.toEqual(cairnFrame())
    expect(cairnFrame({ armDy: -6 })).not.toEqual(cairnFrame())
    expect(cairnFrame({ armDx: 6 })).not.toEqual(cairnFrame())
  })

  it('조립 순서 — 앞팔이 몸통 위에 온다', () => {
    // 앞팔을 크게 움직이면 그 자리의 픽셀이 바뀌어야 한다. 몸통에 가려지면 안 바뀐다.
    const rest = cairnFrame()
    const raised = cairnFrame({ armDy: -6 })
    const armColumn = CAIRN_OFFSETS.ARM_F[0] + 4

    const differs = rest.some((row, y) => row[armColumn] !== raised[y]?.[armColumn])
    expect(differs).toBe(true)
  })

  it('파편 4개가 makeFragments 의 순서·오프셋과 맞는다', () => {
    // 어긋나면 머리가 기단 자리에서 날아온다.
    const homes = [
      CAIRN_OFFSETS.HEAD, CAIRN_OFFSETS.ARM_B, CAIRN_OFFSETS.ARM_F, CAIRN_OFFSETS.BASE,
    ]
    expect(FRAGMENT_PARTS).toEqual(['HEAD', 'ARM_BACK', 'ARM', 'BASE'])
    FRAGMENT_PARTS.forEach((part, i) => {
      expect([i, fragmentFrame(i)]).toEqual([i, CAIRN_PARTS[part]])
      expect([i, homes[i]!.length]).toEqual([i, 2])
    })
  })

  it('범위를 벗어난 파편 번호도 터지지 않는다', () => {
    expect(fragmentFrame(99)).toEqual(CAIRN_PARTS.HEAD)
  })
})

describe('캐른 포즈', () => {
  it('강타는 예비 동안 팔을 들고 있는다 — 예비가 길어야 공정하다', () => {
    expect(cairnPose('slam', 0, 0).armDy).toBeLessThan(0)
    expect(cairnPose('slam', 29, 0).armDy).toBeLessThan(0)
    expect(cairnPose('slam', 30, 0).armDy).toBeGreaterThan(0)
  })

  it('예비 프레임 수가 CAIRN 상수와 같다 — 어긋나면 타이밍을 못 읽는다', () => {
    expect(cairnPose('slam', CAIRN.slam.windupFrames - 1, 0).armDy).toBeLessThan(0)
    expect(cairnPose('slam', CAIRN.slam.windupFrames, 0).armDy).toBeGreaterThan(0)

    expect(cairnPose('throw', CAIRN.throwPattern.windupFrames - 1, 0).armDx).toBeLessThan(0)
    expect(cairnPose('throw', CAIRN.throwPattern.windupFrames, 0).armDx).toBeGreaterThan(0)

    expect(cairnPose('quake', CAIRN.quake.windupFrames - 1, 0).armDy).toBeLessThan(0)
    expect(cairnPose('quake', CAIRN.quake.windupFrames, 0).armDy).toBeGreaterThan(0)

    expect(cairnPose('split', CAIRN.split.windupFrames - 1, 0).coreOnly).toBeFalsy()
    expect(cairnPose('split', CAIRN.split.windupFrames, 0).coreOnly).toBe(true)
  })

  it('재결합하면 몸이 돌아온다', () => {
    expect(cairnPose('merge', 0, 0).coreOnly).toBe(true)
    expect(cairnPose('merge', 30, 0).coreOnly).toBe(false)
  })

  it('대기는 느리게 호흡한다 — 정지 상태에서도 크고 느린 것이 읽혀야 한다', () => {
    expect(cairnPose('idle', 0, 0).dy).toBe(0)
    expect(cairnPose('idle', 0, 20).dy).toBe(1)
    expect(cairnPose('idle', 0, 40).dy).toBe(0)
  })

  it('모르는 상태는 대기로 떨어진다', () => {
    expect(cairnPose('없는상태', 0, 0)).toEqual(cairnPose('idle', 0, 0))
  })
})
