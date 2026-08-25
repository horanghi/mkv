import { describe, expect, it } from 'vitest'
import {
  MatrixError,
  SPRITE_SIZE,
  blankFrame,
  freezeFrame,
  heightOf,
  stamp,
  validateAll,
  validateFrame,
  validateMatrix,
  widthOf,
} from './matrix.ts'

describe('매트릭스 검증', () => {
  it('직사각형을 통과시킨다', () => {
    const m = ['012', '345']
    expect(validateMatrix('t', m)).toBe(m)
  })

  it('행 길이가 다르면 어느 행인지 알려준다', () => {
    // 한 글자만 짧아도 그 아래가 통째로 밀린다. 화면에서는 원인을 찾을 수 없다.
    expect(() => validateMatrix('ARM_F', ['0220', '022'])).toThrow(
      'ARM_F: 행 1 의 길이가 3 다 — 4 여야 한다',
    )
  })

  it('빈 매트릭스는 허용한다 — 속옷에는 투구 깃털이 없다', () => {
    expect(validateMatrix('PLUME', [])).toEqual([])
  })

  it('첫 행이 비면 거부한다', () => {
    expect(() => validateMatrix('t', [''])).toThrow(/첫 행이 비어 있다/)
  })

  it('묶음을 한 번에 검사하고 이름을 붙인다', () => {
    expect(() => validateAll('BARE', { HEAD: ['00', '0'] })).toThrow(/BARE\.HEAD/)
  })

  it('오류 객체가 파츠 이름을 들고 있다', () => {
    const err = new MatrixError('TORSO', '문제')
    expect(err.part).toBe('TORSO')
    expect(err.name).toBe('MatrixError')
  })
})

describe('프레임 검증', () => {
  it('32×32 를 통과시킨다', () => {
    expect(validateFrame('f', freezeFrame(blankFrame()))).toHaveLength(SPRITE_SIZE)
  })

  it('높이가 다르면 거부한다', () => {
    expect(() => validateFrame('f', ['.'.repeat(32)])).toThrow(/높이가 1/)
  })

  it('폭이 다르면 거부한다', () => {
    const rows = Array.from({ length: 32 }, () => '.'.repeat(32))
    rows[7] = '.'.repeat(31)
    expect(() => validateFrame('f', rows)).toThrow(/행 7 의 폭이 31/)
  })
})

describe('스탬프', () => {
  it('투명은 건너뛴다 — 뒤 파츠가 비친다', () => {
    const g = blankFrame(4)
    stamp(g, ['11', '11'], 0, 0)
    stamp(g, ['.2', '..'], 0, 0)
    expect(freezeFrame(g)).toEqual(['12..', '11..', '....', '....'])
  })

  it('오프셋대로 찍는다', () => {
    const g = blankFrame(4)
    stamp(g, ['9'], 2, 3)
    expect(freezeFrame(g)[3]).toBe('..9.')
  })

  it('격자 밖은 잘라낸다 — 오프셋이 커도 터지지 않는다', () => {
    const g = blankFrame(4)
    expect(() => stamp(g, ['999'], 3, 3)).not.toThrow()
    expect(freezeFrame(g)[3]).toBe('...9')
    expect(() => stamp(g, ['9'], -5, -5)).not.toThrow()
    expect(() => stamp(g, ['9'], 0, 99)).not.toThrow()
  })

  it('음수 오프셋의 보이는 부분만 남긴다', () => {
    const g = blankFrame(4)
    stamp(g, ['789'], -1, 0)
    expect(freezeFrame(g)[0]).toBe('89..')
  })
})

describe('크기', () => {
  it('폭과 높이를 준다', () => {
    expect(widthOf(['012', '345'])).toBe(3)
    expect(heightOf(['012', '345'])).toBe(2)
    expect(widthOf([])).toBe(0)
  })
})
