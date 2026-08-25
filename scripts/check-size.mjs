import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 초기 로드 예산 검사.
 *
 * GOAL.md 의 비협상 원칙 5번: **초기 로드 8MB 이내.** 웹을 고른 이유가 그것이다.
 * 런타임 계측(`src/telemetry/loadSize.ts`)은 테스터가 실제로 받은 바이트를 재지만,
 * 그건 이미 배포된 뒤다. 예산을 넘긴 빌드는 아예 나가지 않아야 한다.
 *
 * 소스맵은 세지 않는다 — 브라우저가 개발자 도구를 열기 전에는 받지 않는다.
 */

const BUDGET_BYTES = 8 * 1024 * 1024
const DIST = 'dist'

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else if (!entry.name.endsWith('.map')) out.push(path)
  }
  return out
}

const files = await walk(DIST)
const sizes = await Promise.all(files.map(async (path) => ({ path, bytes: (await stat(path)).size })))
const total = sizes.reduce((sum, file) => sum + file.bytes, 0)

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)}MB`
const pct = ((total / BUDGET_BYTES) * 100).toFixed(1)

if (total > BUDGET_BYTES) {
  console.error(`초기 로드 예산 초과: ${mb(total)} / ${mb(BUDGET_BYTES)}`)
  for (const file of sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
    console.error(`  ${mb(file.bytes).padStart(8)}  ${file.path}`)
  }
  console.error('GOAL.md 비협상 원칙 5 — 웹을 고른 이유다. 줄이거나 지연 로딩으로 뺀다.')
  process.exit(1)
}

console.log(`초기 로드 ${mb(total)} / ${mb(BUDGET_BYTES)} (${pct}%) — 소스맵 제외`)
