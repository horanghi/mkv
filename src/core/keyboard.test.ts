import { describe, expect, it } from 'vitest'
import { isDown } from './input.ts'
import { DEFAULT_BINDINGS, KeyboardSource, validateBindings } from './keyboard.ts'

/** 브라우저 없이 키 이벤트를 흉내 낸다. node 의 EventTarget 을 그대로 쓴다. */
function fakeTarget() {
  const target = new EventTarget()
  let prevented = 0
  return {
    target,
    get prevented() {
      return prevented
    },
    key(type: 'keydown' | 'keyup', code: string, repeat = false): void {
      const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat })
      Object.defineProperty(event, 'preventDefault', {
        value: () => {
          prevented += 1
        },
      })
      target.dispatchEvent(event)
    },
    blur(): void {
      target.dispatchEvent(new Event('blur'))
    },
  }
}

describe('키 바인딩', () => {
  it('기본 바인딩이 docs/09 표와 같다', () => {
    expect(DEFAULT_BINDINGS['ArrowLeft']).toBe('left')
    expect(DEFAULT_BINDINGS['KeyZ']).toBe('jump')
    expect(DEFAULT_BINDINGS['Space']).toBe('jump')
    expect(DEFAULT_BINDINGS['KeyX']).toBe('attack')
    expect(DEFAULT_BINDINGS['KeyC']).toBe('sigil')
    expect(DEFAULT_BINDINGS['KeyR']).toBe('restart')
  })

  it('기본 바인딩은 전부 유효한 액션을 가리킨다', () => {
    expect(validateBindings(DEFAULT_BINDINGS)).toEqual([])
  })

  it('잘못된 바인딩을 찾아낸다', () => {
    expect(validateBindings({ KeyQ: 'fly' as never })).toEqual(['KeyQ'])
  })
})

describe('폴링', () => {
  it('누른 키가 프레임에 들어온다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'KeyZ')
    expect(isDown(source.poll(), 'jump')).toBe(true)
  })

  it('누르고 있으면 계속 들어온다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'ArrowRight')
    source.poll()
    expect(isDown(source.poll(), 'right')).toBe(true)
  })

  it('떼면 사라진다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'ArrowRight')
    source.poll()
    fake.key('keyup', 'ArrowRight')
    expect(isDown(source.poll(), 'right')).toBe(false)
  })

  it('한 틱보다 짧은 탭을 삼키지 않는다', () => {
    // 히트스톱·프레임 드랍 중에 눌렀다 뗀 입력이 사라지면 안 된다.
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'KeyZ')
    fake.key('keyup', 'KeyZ')

    expect(isDown(source.poll(), 'jump')).toBe(true)
    // 다음 폴링에는 남아 있지 않다 — 한 틱만 유효하다.
    expect(isDown(source.poll(), 'jump')).toBe(false)
  })

  it('키 리핏은 새 입력이 아니다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'KeyZ')
    source.poll()
    fake.key('keyup', 'KeyZ')
    fake.key('keydown', 'KeyZ', true)
    // repeat 는 무시되므로 held 에도 들어가지 않는다.
    expect(isDown(source.poll(), 'jump')).toBe(false)
  })

  it('모르는 키는 무시한다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'F13')
    fake.key('keyup', 'F13')
    expect(source.poll()).toBe(0)
    expect(fake.prevented).toBe(0)
  })
})

describe('기본 동작 차단', () => {
  it('방향키와 스페이스의 스크롤을 막는다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'ArrowDown')
    fake.key('keydown', 'Space')
    source.poll()
    expect(fake.prevented).toBe(2)
  })

  it('일반 키는 막지 않는다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'KeyZ')
    source.poll()
    expect(fake.prevented).toBe(0)
  })
})

describe('정리', () => {
  it('포커스를 잃으면 눌린 키가 풀린다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    fake.key('keydown', 'ArrowRight')
    fake.blur()
    expect(source.poll()).toBe(0)
  })

  it('destroy 후에는 이벤트를 받지 않는다', () => {
    const fake = fakeTarget()
    const source = new KeyboardSource(fake.target)

    source.destroy()
    fake.key('keydown', 'KeyZ')
    expect(source.poll()).toBe(0)
  })
})

describe('입력 멈춤', () => {
  it('멈추면 키를 받지 않는다 — 설문에 메모를 적는 동안 랜슬이 뛰면 안 된다', () => {
    const dom = fakeTarget()
    const source = new KeyboardSource(dom.target)

    source.setSuspended(true)
    dom.key('keydown', 'ArrowRight')
    dom.key('keydown', 'KeyZ')

    expect(source.poll()).toBe(0)
  })

  it('멈추는 순간 눌려 있던 키를 비운다 — 유령 입력을 남기지 않는다', () => {
    const dom = fakeTarget()
    const source = new KeyboardSource(dom.target)

    dom.key('keydown', 'ArrowRight')
    source.setSuspended(true)
    source.setSuspended(false)

    expect(source.poll()).toBe(0)
  })

  it('다시 받으면 정상으로 돌아온다', () => {
    const dom = fakeTarget()
    const source = new KeyboardSource(dom.target)

    source.setSuspended(true)
    dom.key('keydown', 'ArrowRight')
    source.setSuspended(false)
    dom.key('keydown', 'ArrowRight')

    expect(isDown(source.poll(), 'right')).toBe(true)
  })

  it('멈춤 중의 키업은 무시된다 — 뗀 것도 안 본다', () => {
    const dom = fakeTarget()
    const source = new KeyboardSource(dom.target)

    dom.key('keydown', 'ArrowRight')
    source.setSuspended(true)
    dom.key('keyup', 'ArrowRight')
    source.setSuspended(false)
    dom.key('keydown', 'ArrowRight')

    expect(isDown(source.poll(), 'right')).toBe(true)
  })
})
