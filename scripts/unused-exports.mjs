import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * "문서엔 있는데 게임엔 없는 것" 을 기계적으로 찾는다.
 *
 *   npm run unused
 *
 * 이 프로젝트가 반복해서 밟은 결함은 전부 같은 모양이었다 — 상수나 함수가
 * 주석까지 달고 정의돼 있는데 **아무도 읽지 않는다.** 테스트가 그 죽은 쪽에
 * 붙어 있으면 통과하므로 거짓 안심까지 준다.
 *
 *   - 캐른의 `emission.gravestones` — 보스에 안전지대가 생겼다
 *   - `DEATH_TIMING.boneCount` — 사망 연출의 백골 분해가 없었다
 *   - `stageTimeLimitSeconds` — 시간 초과가 아무도 죽이지 않았다
 *   - `showsGameOver` — 같은 규칙이 두 군데 있었다
 *
 * 여기 뜬다고 전부 결함은 아니다. 타입 별칭, 테스트가 지키는 명세 가드,
 * 음원 파일을 기다리는 자리는 정상이다. **주석이 동작을 서술하는데 아무도
 * 부르지 않는 것**이 위험 신호다.
 */

const SRC = 'src'
const DECL = /^export\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/gm

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(path))
    else if (entry.name.endsWith('.ts')) out.push(path)
  }
  return out
}

const files = await walk(SRC)
const source = new Map(
  await Promise.all(files.map(async (f) => [f, await readFile(f, 'utf8')])),
)

const isTest = (f) => f.endsWith('.test.ts')
const production = [...source].filter(([f]) => !isTest(f))
const tests = [...source].filter(([f]) => isTest(f))

const testOnly = []
const unused = []

for (const [home, text] of production) {
  for (const [, name] of text.matchAll(DECL)) {
    const word = new RegExp(`\\b${name}\\b`)
    if (production.some(([f, s]) => f !== home && word.test(s))) continue
    ;(tests.some(([, s]) => word.test(s)) ? testOnly : unused).push({ name, home })
  }
}

const byHome = (a, b) => a.home.localeCompare(b.home) || a.name.localeCompare(b.name)

function print(title, rows, note) {
  console.log(`\n  ${title}  (${rows.length})`)
  if (note) console.log(`  \x1b[90m${note}\x1b[0m`)
  for (const { name, home } of rows.sort(byHome)) {
    console.log(`    ${name.padEnd(28)} \x1b[90m${home}\x1b[0m`)
  }
}

print('테스트에서만 쓰인다', testOnly,
  '명세 가드면 정상이다. 동작을 서술하는 주석이 붙어 있으면 배선을 확인하라.')
print('아무 데서도 안 쓰인다', unused,
  '타입 별칭은 정상이다. 함수와 상수는 지우거나 연결하라.')
console.log('')
