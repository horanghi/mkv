/**
 * 초기 로드 용량 계측.
 *
 * 게이트의 "초기 로드 8MB 이하"는 빌드 산출물 크기로 어림잡을 수도 있지만,
 * 실제로 브라우저가 받은 바이트가 답이다. gzip 이 걸리고, 폰트가 늦게 붙고,
 * 캐시가 끼면 숫자가 달라진다.
 *
 * → prompts/m1-gate.md
 */

/** `PerformanceResourceTiming` 중 우리가 쓰는 부분만. */
export interface SizedEntry {
  readonly name: string
  /** 실제로 네트워크에서 받은 바이트. 캐시에 맞으면 0 이 된다. */
  readonly transferSize?: number
  /** 압축된 본문 크기. 캐시일 때의 대체값. */
  readonly encodedBodySize?: number
}

/**
 * 받은 바이트를 합친다.
 *
 * `transferSize` 가 0 이면 캐시에 맞은 것이므로 `encodedBodySize` 로 대신한다.
 * 캐시 덕에 0MB 라고 보고하면 처음 오는 사람 기준을 못 재기 때문이다.
 */
export function totalLoadBytes(entries: readonly SizedEntry[]): number {
  let total = 0
  for (const entry of entries) {
    const transfer = entry.transferSize ?? 0
    total += transfer > 0 ? transfer : (entry.encodedBodySize ?? 0)
  }
  return total
}

/** 큰 것부터. 예산을 넘겼을 때 무엇이 범인인지 바로 보여준다. */
export function biggestAssets(
  entries: readonly SizedEntry[],
  limit = 5,
): readonly (readonly [string, number])[] {
  return entries
    .map((entry) => {
      const transfer = entry.transferSize ?? 0
      return [shortName(entry.name), transfer > 0 ? transfer : (entry.encodedBodySize ?? 0)] as const
    })
    .filter(([, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function shortName(url: string): string {
  const cut = url.split('?')[0] ?? url
  // 끝이 슬래시인 문서 주소면 마지막 조각이 비어 있다. 그럴 땐 호스트가 이름이다.
  const parts = cut.split('/').filter((part) => part !== '' && !part.endsWith(':'))
  return parts[parts.length - 1] ?? cut
}
