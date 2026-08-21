/**
 * 밸런스 JSON 검증용 최소 도구.
 *
 * 이 JSON 은 우리가 직접 쓰고 개발 중 핫리로드된다. 외부 입력이 아니므로
 * 스키마 라이브러리를 붙일 이유가 없다 — 번들 400KB 예산이 더 비싸다.
 * 필요한 건 오타를 즉시, 읽을 수 있는 메시지로 잡아주는 것뿐이다.
 */

export class BalanceError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`)
    this.name = 'BalanceError'
  }
}

/** `$` 로 시작하는 키는 주석용 메타데이터다 (`$source` 등). 검증에서 무시한다. */
export function isMetaKey(key: string): boolean {
  return key.startsWith('$')
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BalanceError(path, `객체여야 하는데 ${describe(value)} 이다`)
  }
  return value as Record<string, unknown>
}

export function asArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new BalanceError(path, `배열이어야 하는데 ${describe(value)} 이다`)
  }
  return value
}

export function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BalanceError(path, `유한한 수여야 하는데 ${describe(value)} 이다`)
  }
  return value
}

/** 프레임 수·HP 처럼 음수가 의미 없는 값에 쓴다. */
export function asNonNegative(value: unknown, path: string): number {
  const n = asNumber(value, path)
  if (n < 0) throw new BalanceError(path, `0 이상이어야 하는데 ${n} 이다`)
  return n
}

export function asInteger(value: unknown, path: string): number {
  const n = asNumber(value, path)
  if (!Number.isInteger(n)) throw new BalanceError(path, `정수여야 하는데 ${n} 이다`)
  return n
}

export function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new BalanceError(path, `문자열이어야 하는데 ${describe(value)} 이다`)
  }
  return value
}

export function asEnum<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
): T[number] {
  const s = asString(value, path)
  if (!allowed.includes(s)) {
    throw new BalanceError(path, `${allowed.join(' | ')} 중 하나여야 하는데 "${s}" 이다`)
  }
  return s
}

export function requireKey(record: Record<string, unknown>, key: string, path: string): unknown {
  if (!(key in record)) throw new BalanceError(`${path}.${key}`, '없다')
  return record[key]
}

/** id 중복은 조용히 마지막 것만 살아남아 추적이 어렵다. 로드 시점에 터뜨린다. */
export function assertUniqueIds(ids: readonly string[], path: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) throw new BalanceError(path, `id 가 중복된다: "${id}"`)
    seen.add(id)
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return '배열'
  return typeof value
}
