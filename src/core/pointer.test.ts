import { afterEach, describe, expect, it } from 'vitest'
import { browserMediaQuery, needsKeyboardNotice, type MediaQuery } from './pointer.ts'

/** 질의 목록을 받아 그것만 참으로 답한다. */
function answering(...trueQueries: readonly string[]): MediaQuery {
  return (query) => trueQueries.includes(query)
}

describe('키보드 안내가 필요한 기기', () => {
  it('폰 — 굵은 포인터만 있으면 안내한다', () => {
    expect(needsKeyboardNotice(answering('(pointer: coarse)'))).toBe(true)
  })

  it('데스크톱 — 마우스만 있으면 안내하지 않는다', () => {
    expect(needsKeyboardNotice(answering('(any-pointer: fine)'))).toBe(false)
  })

  it('터치스크린 노트북 — 둘 다 있으면 안내하지 않는다', () => {
    const both = answering('(pointer: coarse)', '(any-pointer: fine)')
    expect(needsKeyboardNotice(both)).toBe(false)
  })

  it('아무것도 모르면 안내하지 않는다 — 되는 사람을 막지 않는다', () => {
    expect(needsKeyboardNotice(answering())).toBe(false)
  })
})

describe('브라우저 구현', () => {
  const original = Reflect.get(globalThis, 'matchMedia') as unknown

  afterEach(() => {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'matchMedia')
    else Reflect.set(globalThis, 'matchMedia', original)
  })

  it('matchMedia 의 답을 그대로 돌려준다', () => {
    Reflect.set(globalThis, 'matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }))
    const query = browserMediaQuery()
    expect(query('(pointer: coarse)')).toBe(true)
    expect(query('(any-pointer: fine)')).toBe(false)
  })

  it('matchMedia 가 없으면 거짓이다 — 되는 사람을 막지 않는다', () => {
    Reflect.deleteProperty(globalThis, 'matchMedia')
    expect(browserMediaQuery()('(pointer: coarse)')).toBe(false)
  })

  it('matchMedia 가 던져도 죽지 않는다', () => {
    Reflect.set(globalThis, 'matchMedia', () => { throw new Error('나쁜 브라우저') })
    expect(browserMediaQuery()('(pointer: coarse)')).toBe(false)
  })
})
