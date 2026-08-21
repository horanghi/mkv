import { describe, expect, it } from 'vitest'
import {
  BalanceError,
  asArray,
  asEnum,
  asInteger,
  asNonNegative,
  asNumber,
  asRecord,
  asString,
  assertUniqueIds,
  isMetaKey,
  requireKey,
} from './validate.ts'

describe('타입 단언', () => {
  it('객체를 통과시키고 배열·null 은 거부한다', () => {
    expect(asRecord({ a: 1 }, 'p')).toEqual({ a: 1 })
    expect(() => asRecord([], 'p')).toThrow(BalanceError)
    expect(() => asRecord(null, 'p')).toThrow(/null/)
    expect(() => asRecord(3, 'p')).toThrow(/number/)
  })

  it('배열만 통과시킨다', () => {
    expect(asArray([1, 2], 'p')).toEqual([1, 2])
    expect(() => asArray({}, 'p')).toThrow(BalanceError)
  })

  it('유한한 수만 통과시킨다', () => {
    expect(asNumber(-420, 'p')).toBe(-420)
    expect(() => asNumber(Number.NaN, 'p')).toThrow(BalanceError)
    expect(() => asNumber(Number.POSITIVE_INFINITY, 'p')).toThrow(BalanceError)
    expect(() => asNumber('110', 'p')).toThrow(/string/)
  })

  it('음수를 거부한다', () => {
    expect(asNonNegative(0, 'p')).toBe(0)
    expect(() => asNonNegative(-1, 'p')).toThrow(/0 이상/)
  })

  it('정수를 강제한다', () => {
    expect(asInteger(72, 'p')).toBe(72)
    expect(() => asInteger(1.5, 'p')).toThrow(/정수/)
  })

  it('문자열만 통과시킨다', () => {
    expect(asString('lance', 'p')).toBe('lance')
    expect(() => asString(1, 'p')).toThrow(BalanceError)
  })

  it('열거형을 검사한다', () => {
    expect(asEnum('straight', 'p', ['straight', 'parabolic'] as const)).toBe('straight')
    expect(() => asEnum('zigzag', 'p', ['straight', 'parabolic'] as const)).toThrow(/straight/)
  })
})

describe('키 · 중복', () => {
  it('없는 키를 경로와 함께 알려준다', () => {
    expect(() => requireKey({}, 'runSpeed', 'player')).toThrow('player.runSpeed: 없다')
  })

  it('값이 undefined 여도 키가 있으면 통과한다', () => {
    expect(requireKey({ a: undefined }, 'a', 'p')).toBeUndefined()
  })

  it('id 중복을 잡는다', () => {
    expect(() => assertUniqueIds(['a', 'b', 'a'], 'weapons')).toThrow(/중복.*"a"/)
    expect(() => assertUniqueIds(['a', 'b'], 'weapons')).not.toThrow()
  })

  it('$ 로 시작하는 키를 메타로 본다', () => {
    expect(isMetaKey('$source')).toBe(true)
    expect(isMetaKey('runSpeed')).toBe(false)
  })
})

describe('BalanceError', () => {
  it('경로를 메시지 앞에 붙인다', () => {
    const err = new BalanceError('weapons[2].damage', '유한한 수여야 한다')
    expect(err.message).toBe('weapons[2].damage: 유한한 수여야 한다')
    expect(err.path).toBe('weapons[2].damage')
    expect(err.name).toBe('BalanceError')
  })
})
