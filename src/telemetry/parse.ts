import type { Payload } from './payload.ts'

/**
 * 붙여넣은 텍스트에서 결과 꾸러미를 골라낸다.
 *
 * 테스터는 파일을 보내지 않는다. 메신저에 "이거요" 하고 붙여넣는다 —
 * 사람이 쓴 말과 JSON 이 섞여 오고, 메신저가 따옴표를 바꿔 놓기도 한다.
 *
 * **못 읽은 것을 세는 것이 이 모듈의 절반이다.** 조용히 버리면 다섯 명이
 * 보냈는데 넷으로 판정되고, 아무도 그 사실을 모른다.
 *
 * → prompts/m1-gate-testers.md
 */

export interface Extracted {
  readonly payloads: readonly Payload[]
  /** 꾸러미처럼 보였지만 읽지 못한 것. 사람에게 알려야 한다 */
  readonly broken: number
}

/** 꾸러미인지 가려내는 표식. 사람이 쓴 글 속의 중괄호와 구분한다. */
const MARKERS = ['"fps"', '"deaths"', '"retryRate"']

export function extractPayloads(text: string): Extracted {
  const payloads: Payload[] = []
  let broken = 0

  for (const candidate of braceBlocks(text)) {
    if (!MARKERS.some((marker) => candidate.includes(marker))) continue

    const parsed = parseLoosely(candidate)
    if (parsed === null) broken += 1
    else payloads.push(parsed)
  }

  return { payloads, broken }
}

/** 중괄호가 맞아떨어지는 덩어리를 순서대로 준다. */
function* braceBlocks(text: string): Generator<string> {
  let depth = 0
  let start = -1

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        yield text.slice(start, i + 1)
        start = -1
      }
    }
  }
}

/**
 * 한 번은 그대로, 안 되면 따옴표만 되돌려 한 번 더 읽는다.
 *
 * 메신저가 곧은 따옴표를 굽은 것으로 바꾸는 일이 흔하다. 그것 때문에
 * 한 사람 몫이 통째로 사라지면 표본이 모자라 판정 자체가 미뤄진다.
 * 성한 것은 첫 시도에서 끝나므로 손대지 않는다.
 */
function parseLoosely(candidate: string): Payload | null {
  const direct = asPayload(candidate)
  if (direct !== null) return direct

  return asPayload(candidate
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'"))
}

function asPayload(candidate: string): Payload | null {
  let value: unknown
  try {
    value = JSON.parse(candidate)
  } catch {
    return null
  }

  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record['v'] !== 'number') return null
  if (typeof record['fps'] !== 'object' || record['fps'] === null) return null

  return value as Payload
}
