import { readFile } from 'node:fs/promises'

/**
 * m1-gate 판정 — 테스터가 보내온 결과 꾸러미를 합쳐 통과 여부를 찍는다.
 *
 *   npm run gate -- results/*.json
 *   cat payloads.txt | npm run gate
 *
 * 입력은 빌드의 "결과 복사" 가 만든 JSON 이다. 파일 하나에 여러 개가
 * 줄 단위로 들어 있어도 되고(메신저에서 긁어온 그대로), 파일마다 하나여도 된다.
 *
 * 합산 규칙과 판정은 `src/telemetry/aggregate.ts` 가 정한다 —
 * 여기서는 읽고 찍기만 한다. 규칙이 코드에 있어야 테스트로 지킬 수 있다.
 */

const MARK = { pass: '통과', fail: '미달', unknown: '표본부족' }
const COLOR = { pass: '\x1b[32m', fail: '\x1b[31m', unknown: '\x1b[90m' }
const RESET = '\x1b[0m'

/** 한글·한자는 터미널에서 두 칸을 먹는다. 그걸 세지 않으면 표의 열이 어긋난다. */
function cells(text) {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    width += wide ? 2 : 1
  }
  return width
}

/** `padEnd` 를 칸 수 기준으로 다시 쓴 것. */
function pad(text, width) {
  return text + ' '.repeat(Math.max(0, width - cells(text)))
}

async function readInput(paths) {
  if (paths.length > 0) {
    const texts = await Promise.all(paths.map((p) => readFile(p, 'utf8')))
    return texts.join('\n')
  }
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const text = await readInput(process.argv.slice(2))

const { extractPayloads } = await import('../src/telemetry/parse.ts')
const { payloads, broken } = extractPayloads(text)

if (payloads.length === 0) {
  console.error('결과 꾸러미를 못 찾았다. 빌드의 "결과 복사" 가 만든 JSON 을 넣어라.')
  if (broken > 0) console.error(`(꾸러미처럼 보이지만 읽지 못한 것이 ${broken}건 있다.)`)
  console.error('  npm run gate -- results/*.json')
  console.error('  cat payloads.txt | npm run gate')
  process.exit(2)
}

const { aggregate, gateVerdict, overall, MIN_TESTERS, GATE_DIFFICULTY } =
  await import('../src/telemetry/aggregate.ts')
const { DIFFICULTY_RULES } = await import('../src/game/difficulty.ts')
const gateName = DIFFICULTY_RULES[GATE_DIFFICULTY].name
const { CAUSE_LABELS } = await import('../src/telemetry/report.ts')

const agg = aggregate(payloads)
const lines = gateVerdict(agg)
const verdict = overall(lines)

console.log('')
console.log(`  M1 게이트 — ${COLOR[verdict]}${MARK[verdict]}${RESET}   (${gateName} · 테스터 ${agg.testers}명 / 최소 ${MIN_TESTERS}명)`)
if (agg.duplicatesDropped > 0) {
  console.log(`  같은 사람이 두 번 낸 것 ${agg.duplicatesDropped}건은 걸렀다.`)
}
if (broken > 0) {
  console.log(`  \x1b[31m읽지 못한 꾸러미 ${broken}건.\x1b[0m 붙여넣다가 잘렸을 수 있다 —`)
  console.log(`  \x1b[31m그 사람에게 다시 받아라. 모르고 넘어가면 표본이 그만큼 준다.\x1b[0m`)
}
if (agg.staleDropped > 0) {
  const versions = agg.stale.map(([v, n]) => `v${v} ${n}명`).join(', ')
  console.log(`  \x1b[33m낡은 형식이라 뺀 것 ${agg.staleDropped}건 (${versions}).`)
  console.log(`  재는 방식이 바뀌었으므로 합칠 수 없다 — 다시 받아야 한다.${RESET}`)
}
if (agg.offDifficultyDropped > 0) {
  const where = agg.offDifficulty
    .map(([diff, n]) => `${DIFFICULTY_RULES[diff]?.name ?? diff} ${n}명`)
    .join(', ')
  console.log(`  \x1b[90m${gateName}가 아니라서 뺀 것 ${agg.offDifficultyDropped}건 (${where}).`)
  console.log(`  합격선은 한 난이도에 대한 숫자다 — 섞으면 어느 쪽도 아닌 값이 된다.${RESET}`)
}
console.log('')

for (const line of lines) {
  const mark = `${COLOR[line.verdict]}${pad(MARK[line.verdict], 10)}${RESET}`
  console.log(`  ${mark} ${pad(line.label, 26)} ${line.value}`)
  console.log(`  ${' '.repeat(10)} ${' '.repeat(26)} \x1b[90m목표 ${line.target}${RESET}`)
}

if (agg.hotspots.length > 0) {
  console.log('')
  console.log('  사망 구간 (타일)  — 겹치는 곳이 판독 불가 구간이다')
  for (const [tx, count] of agg.hotspots.slice(0, 6)) {
    console.log(`    ${String(tx).padStart(4)}~${String(tx + 7).padEnd(4)} ${'█'.repeat(Math.min(30, count))} ${count}`)
  }
}

const causes = Object.entries(agg.causes).sort((a, b) => b[1] - a[1])
if (causes.length > 0) {
  console.log('')
  console.log('  사인')
  for (const [cause, count] of causes) {
    console.log(`    ${pad(CAUSE_LABELS[cause] ?? cause, 10)} ${count}`)
  }
}

console.log('')
if (verdict === 'fail') {
  console.log('  \x1b[31m미달 항목이 있다.\x1b[0m prompts/m1-gate.md "재시도율이 낮을 때" 를 먼저 본다 —')
  console.log('  난이도를 낮추기 전에 원인을 분리하라고 적혀 있다.')
} else if (verdict === 'unknown') {
  console.log('  \x1b[90m표본이 모자란다. 통과로 읽지 마라.\x1b[0m')
} else {
  console.log('  \x1b[32m통과. M2 로 넘어가되 각 스테이지마다 다시 잰다.\x1b[0m')
}
console.log('')
