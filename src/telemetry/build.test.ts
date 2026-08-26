import { describe, expect, it } from 'vitest'
import { UNKNOWN_BUILD, buildId, buildIdFrom } from './build.ts'

describe('빌드 식별자', () => {
  it('빌드된 번들에서 내용 해시를 뽑는다', () => {
    expect(buildIdFrom('https://example.com/assets/index-BYhFgpeH.js')).toBe('BYhFgpeH')
  })

  it('하위 경로에 올려도 같다 — 민찬 게임랜드의 /mkv/ 아래', () => {
    expect(buildIdFrom('https://example.com/mkv/assets/index-BYhFgpeH.js'))
      .toBe(buildIdFrom('https://example.com/assets/index-BYhFgpeH.js'))
  })

  it('코드가 바뀌면 값이 달라진다 — 그게 이 항목의 존재 이유다', () => {
    expect(buildIdFrom('/assets/index-BYhFgpeH.js'))
      .not.toBe(buildIdFrom('/assets/index-CZqQwXy2.js'))
  })

  it('개발 서버에는 해시가 없다', () => {
    expect(buildIdFrom('http://localhost:5173/src/telemetry/build.ts')).toBe(UNKNOWN_BUILD)
  })

  it('빈 문자열이나 이상한 값에도 죽지 않는다', () => {
    expect(buildIdFrom('')).toBe(UNKNOWN_BUILD)
    expect(buildIdFrom('/assets/pixi-FJIx4rpS.js')).toBe(UNKNOWN_BUILD)
    expect(buildIdFrom('/assets/index-.js')).toBe(UNKNOWN_BUILD)
  })

  it('실제로 부를 수 있다', () => {
    expect(typeof buildId()).toBe('string')
    expect(buildId().length).toBeGreaterThan(0)
  })
})
