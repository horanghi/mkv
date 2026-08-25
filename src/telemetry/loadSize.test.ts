import { describe, expect, it } from 'vitest'
import { biggestAssets, totalLoadBytes, type SizedEntry } from './loadSize.ts'

const ENTRIES: readonly SizedEntry[] = [
  { name: 'https://x/assets/index-abc.js', transferSize: 120_000, encodedBodySize: 118_000 },
  // 캐시에 맞아 transferSize 가 0 이다
  { name: 'https://x/assets/style.css?v=2', transferSize: 0, encodedBodySize: 8_000 },
  { name: 'https://x/', encodedBodySize: 1_200 },
]

describe('초기 로드 용량', () => {
  it('받은 바이트를 합친다', () => {
    expect(totalLoadBytes(ENTRIES)).toBe(129_200)
  })

  it('캐시에 맞은 것도 크기로 센다 — 0MB 라고 보고하면 거짓이다', () => {
    expect(totalLoadBytes([{ name: 'a', transferSize: 0, encodedBodySize: 5_000 }])).toBe(5_000)
  })

  it('크기를 모르는 항목은 0 이다', () => {
    expect(totalLoadBytes([{ name: 'a' }])).toBe(0)
    expect(totalLoadBytes([])).toBe(0)
  })

  it('큰 것부터, 파일명만 보여준다', () => {
    expect(biggestAssets(ENTRIES, 2)).toEqual([
      ['index-abc.js', 120_000],
      ['style.css', 8_000],
    ])
  })

  it('크기 0 인 항목은 목록에서 뺀다', () => {
    expect(biggestAssets([{ name: 'a', transferSize: 0 }])).toEqual([])
  })

  it('경로가 없는 이름도 견딘다', () => {
    expect(biggestAssets([{ name: 'https://x/', encodedBodySize: 10 }])).toEqual([['x', 10]])
  })
})
