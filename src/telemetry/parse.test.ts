import { describe, expect, it } from 'vitest'
import { NEW_SESSION } from './session.ts'
import { toJson } from './payload.ts'
import { extractPayloads } from './parse.ts'

const ONE = toJson({ ...NEW_SESSION, id: 'a1b2c3d4' }, 640000)
const TWO = toJson({ ...NEW_SESSION, id: '55aa77bb' }, 640000)

describe('붙여넣은 텍스트에서 꾸러미 골라내기', () => {
  it('사람이 쓴 말 사이에서 찾아낸다', () => {
    const text = `민수: 재밌었어요\n${ONE}\n\n지현\n${TWO}\n다음에 또 불러주세요`
    const { payloads, broken } = extractPayloads(text)

    expect(payloads.map((p) => p.id)).toEqual(['a1b2c3d4', '55aa77bb'])
    expect(broken).toBe(0)
  })

  it('꾸러미가 아닌 중괄호는 세지 않는다 — 깨진 것으로 잡히면 거짓 경보다', () => {
    const { payloads, broken } = extractPayloads('{ 이건 그냥 괄호 } 그리고 {"a":1}')
    expect(payloads).toHaveLength(0)
    expect(broken).toBe(0)
  })

  it('메신저가 따옴표를 바꿔 놔도 읽는다', () => {
    const mangled = ONE.replace('"id"', '“id”')
    const { payloads, broken } = extractPayloads(mangled)

    expect(payloads).toHaveLength(1)
    expect(payloads[0]!.id).toBe('a1b2c3d4')
    expect(broken).toBe(0)
  })

  it('그래도 못 읽으면 **센다.** 조용히 버리면 한 사람이 사라진다', () => {
    // 값이 잘려 나갔다. 괄호는 맞지만 JSON 이 아니다.
    const mangled = '{"v":3,"fps":{"held":1},"deaths":}'
    const { payloads, broken } = extractPayloads(`${ONE}\n${mangled}`)

    expect(payloads).toHaveLength(1)
    expect(broken).toBe(1)
  })

  it('숫자가 아닌 v 는 꾸러미가 아니다', () => {
    const { payloads, broken } = extractPayloads('{"v":"3","fps":{},"deaths":0}')
    expect(payloads).toHaveLength(0)
    expect(broken).toBe(1)
  })

  it('fps 가 없으면 꾸러미가 아니다', () => {
    expect(extractPayloads('{"v":3,"deaths":0}').broken).toBe(1)
  })

  it('빈 텍스트도 견딘다', () => {
    expect(extractPayloads('')).toEqual({ payloads: [], broken: 0 })
  })

  it('닫히지 않은 괄호는 무시한다', () => {
    expect(extractPayloads(`{"fps":{ 어쩌고`).broken).toBe(0)
  })
})
