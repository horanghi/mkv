import { describe, expect, it } from 'vitest'
import { ENEMY_SPECS, ENEMY_KINDS } from '../entities/enemies/enemy.ts'
import { S1_PALETTE } from '../scenery/stage1.ts'
import { ENEMY_SPRITES, PAL_CORVID, PAL_GHOUL, PAL_GRIMM, enemyFrame } from './enemies.ts'
import { heightOf, widthOf } from './matrix.ts'
import { missingIndices } from './palette.ts'

describe('잡몹 도트', () => {
  it('적 3종 모두 스프라이트가 있다', () => {
    for (const kind of ENEMY_KINDS) {
      expect(ENEMY_SPRITES[kind]).toBeDefined()
    }
  })

  it('히트박스가 스프라이트보다 크지 않다 — 보이는 것보다 판정이 크면 불공정하다', () => {
    // docs/02 2.1: 관대한 판정이 원칙이다. 지금은 1:1 로, 그 하한을 지킨다.
    for (const kind of ENEMY_KINDS) {
      const sprite = ENEMY_SPRITES[kind]!
      const spec = ENEMY_SPECS[kind]
      expect([kind, spec.width <= sprite.width]).toEqual([kind, true])
      expect([kind, spec.height <= sprite.height]).toEqual([kind, true])
    }
  })

  it('모든 프레임이 선언한 크기와 같다 — 한 행이 짧으면 아래가 통째로 밀린다', () => {
    for (const [kind, sprite] of Object.entries(ENEMY_SPRITES)) {
      for (const [clip, frames] of Object.entries(sprite.clips)) {
        frames.forEach((frame, i) => {
          expect([kind, clip, i, widthOf(frame)]).toEqual([kind, clip, i, sprite.width])
          expect([kind, clip, i, heightOf(frame)]).toEqual([kind, clip, i, sprite.height])
        })
      }
    }
  })

  it('팔레트에 없는 색 인덱스를 쓰지 않는다 — 조용히 픽셀이 사라진다', () => {
    for (const [kind, sprite] of Object.entries(ENEMY_SPRITES)) {
      for (const frames of Object.values(sprite.clips)) {
        for (const frame of frames) {
          expect([kind, missingIndices(frame, sprite.palette)]).toEqual([kind, []])
        }
      }
    }
  })

  it('프레임이 실제로 비어 있지 않다', () => {
    for (const [kind, sprite] of Object.entries(ENEMY_SPRITES)) {
      for (const frames of Object.values(sprite.clips)) {
        for (const frame of frames) {
          const painted = frame.join('').split('').filter((ch) => ch !== '.').length
          expect([kind, painted > 20]).toEqual([kind, true])
        }
      }
    }
  })

  it('걷기 두 프레임이 서로 다르다 — 같으면 애니메이션이 없는 것이다', () => {
    const ghoul = ENEMY_SPRITES['ghoul']!.clips['default']!
    expect(ghoul[0]).not.toEqual(ghoul[1])

    const corvid = ENEMY_SPRITES['corvid']!.clips['default']!
    expect(corvid[0]).not.toEqual(corvid[1])
  })
})

describe('프레임 고르기', () => {
  it('틱이 흐르면 프레임이 바뀐다', () => {
    const sprite = ENEMY_SPRITES['corvid']!
    const first = enemyFrame(sprite, 'fly', 0)
    const second = enemyFrame(sprite, 'fly', sprite.frameTicks)

    expect(first).not.toEqual(second)
  })

  it('한 바퀴 돌면 처음으로 돌아온다', () => {
    const sprite = ENEMY_SPRITES['corvid']!
    const frames = sprite.clips['default']!.length
    expect(enemyFrame(sprite, 'fly', 0))
      .toEqual(enemyFrame(sprite, 'fly', sprite.frameTicks * frames))
  })

  it('상태 전용 클립이 있으면 그것을 쓴다', () => {
    const ghoul = ENEMY_SPRITES['ghoul']!
    expect(enemyFrame(ghoul, 'spawn', 0)).toEqual(ghoul.clips['spawn']![0])
    expect(enemyFrame(ghoul, 'walk', 0)).toEqual(ghoul.clips['default']![0])
  })

  it('모르는 상태는 기본 클립으로 떨어진다', () => {
    const grimm = ENEMY_SPRITES['grimm']!
    expect(enemyFrame(grimm, '없는상태', 0)).toEqual(grimm.clips['default']![0])
  })

  it('솟는 좀비는 아래가 묻혀 있다 — 흙 위로 올라오는 것으로 읽혀야 한다', () => {
    const rise = ENEMY_SPRITES['ghoul']!.clips['spawn']![0]!
    const walk = ENEMY_SPRITES['ghoul']!.clips['default']![0]!
    const painted = (m: readonly string[]) => m.join('').split('').filter((c) => c !== '.').length

    expect(painted(rise)).toBeLessThan(painted(walk))
    // 맨 윗줄은 비어 있다 — 아직 다 안 나왔다
    expect(rise[0]).toBe('.'.repeat(12))
  })
})

describe('배경 대비', () => {
  /** 명도. 적이 배경 실루엣에 묻히면 "왜 죽었는지 모름"이 된다. */
  function luma(hex: string): number {
    const n = Number.parseInt(hex.slice(1), 16)
    return 0.2126 * ((n >> 16) & 0xff) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff)
  }

  it('적의 주된 색이 가장 밝은 배경 실루엣보다 밝다', () => {
    // 원경이 배경 중 가장 밝다. 그보다 밝아야 어느 층 앞에서도 읽힌다.
    const brightestBackdrop = 0.2126 * ((S1_PALETTE.far >> 16) & 0xff)
      + 0.7152 * ((S1_PALETTE.far >> 8) & 0xff)
      + 0.0722 * (S1_PALETTE.far & 0xff)

    const bodyColors: readonly [string, string][] = [
      ['ghoul', PAL_GHOUL['G']!],
      ['grimm', PAL_GRIMM['L']!],
      ['corvid', PAL_CORVID['K']!],
    ]
    for (const [kind, color] of bodyColors) {
      expect([kind, luma(color) > brightestBackdrop]).toEqual([kind, true])
    }
  })

  it('그림의 눈이 몸보다 훨씬 밝다 — 위치를 즉시 읽는 유일한 신호다', () => {
    // docs/12 12.8 의 공정성 장치. 고정 점프 궤도라 못 보면 회피가 불가능하다.
    expect(luma(PAL_GRIMM['R']!)).toBeGreaterThan(luma(PAL_GRIMM['S']!) * 3)
  })

  it('까마귀 부리도 마찬가지로 유일한 고채도 색이다', () => {
    expect(luma(PAL_CORVID['Y']!)).toBeGreaterThan(luma(PAL_CORVID['K']!) * 3)
  })
})
