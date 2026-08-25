import { rulesFor } from '../../game/difficulty.ts'
import { GATE_DIFFICULTY } from '../../telemetry/aggregate.ts'
import {
  CAUSE_LABELS, buildReport, causeBreakdown, deathHotspots, formatBytes,
  overallVerdict, type Metric, type Verdict,
} from '../../telemetry/report.ts'
import { biggestAssets, type SizedEntry } from '../../telemetry/loadSize.ts'
import type { Session } from '../../telemetry/session.ts'

/**
 * 게이트 판정 패널 — **개발용**.
 *
 * 테스터에게는 보이지 않는다. 재고 있는 지표를 알면 행동이 달라지기 때문이다.
 * (재시도율을 재는 줄 알면 억지로 다시 한다.) 프로덕션에서는 F6 로도 열리지만
 * 기본은 닫혀 있고, 열어야만 보인다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 ui/ 제외. 숫자는 telemetry/ 에서 검증한다.
 */

const VERDICT_COLOR: Readonly<Record<Verdict, string>> = {
  pass: '#7FBF6A',
  fail: '#E23E4E',
  unknown: '#8695AC',
}

const VERDICT_MARK: Readonly<Record<Verdict, string>> = {
  pass: '통과', fail: '미달', unknown: '표본부족',
}

export class GateReportPanel {
  private readonly root: HTMLElement
  private visible = false

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.style.cssText = [
      'position:absolute',
      'top:8px',
      'right:8px',
      'width:340px',
      'max-height:calc(100% - 16px)',
      'overflow-y:auto',
      'display:none',
      'flex-direction:column',
      'gap:8px',
      'padding:12px 14px',
      'background:rgba(11,7,16,.92)',
      'color:#EDE6D8',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'border:1px solid #362B44',
      'pointer-events:auto',
      'z-index:12',
    ].join(';')
    parent.appendChild(this.root)
  }

  toggle(): void {
    this.visible = !this.visible
    this.root.style.display = this.visible ? 'flex' : 'none'
  }

  get open(): boolean {
    return this.visible
  }

  render(session: Session, loadBytes: number | null, entries: readonly SizedEntry[]): void {
    if (!this.visible) return

    const metrics = buildReport({ session, loadBytes })
    const overall = overallVerdict(metrics)

    // 난이도를 같이 적는다. 게이트 난이도(기사) 가 아니면 합산에서 빠지므로,
    // 판정만 보고 "통과" 로 읽으면 안 된다.
    const name = rulesFor(session.difficulty).name
    const offGate = session.difficulty !== GATE_DIFFICULTY
    const tag = offGate ? `[${name} — ⚠ 합산에서 빠진다]` : `[${name}]`

    // dev 서버는 모듈을 낱개로 준다. 그 숫자를 예산으로 읽으면 헛짚는다.
    const built = !import.meta.env.DEV

    this.root.replaceChildren(
      heading(
        `M1 게이트 — ${VERDICT_MARK[overall]}   ${tag}${built ? '' : '   (dev — 용량은 빌드에서 본다)'}`,
        offGate ? '#D2A24C' : VERDICT_COLOR[overall]),
      ...metrics.map(metricRow),
      divider(),
      heading('사망 구간 (타일)', '#A99C8A'),
      list(deathHotspots(session).slice(0, 5)
        .map((spot) => `${spot.tx}~${spot.tx + 7}  ${'█'.repeat(Math.min(20, spot.deaths))} ${spot.deaths}`)),
      heading('사인', '#A99C8A'),
      list(causeBreakdown(session)
        .map(([cause, count]) => `${CAUSE_LABELS[cause as keyof typeof CAUSE_LABELS] ?? cause}  ${count}`)),
      heading('용량 상위', '#A99C8A'),
      list(biggestAssets(entries).map(([name, bytes]) => `${formatBytes(bytes).padStart(8)}  ${name}`)),
      divider(),
      list([
        `플레이 ${(session.playMs / 60000).toFixed(1)}분 · 사망 ${session.deaths.length} · 피격 ${session.hurts}`,
        `갑옷파괴 ${session.armorBreaks} · 보스도달 ${session.bossReached ? 'O' : 'X'} · 클리어 ${session.clears}`,
        `프레임 표본 ${session.frames.samples} (버림 ${session.frames.discarded}) · 최악 ${session.frames.worstMs.toFixed(1)}ms`,
      ]),
    )
  }

  destroy(): void {
    this.root.remove()
  }
}

function metricRow(metric: Metric): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;flex-direction:column;gap:1px'

  const top = document.createElement('div')
  top.style.cssText = 'display:flex;justify-content:space-between;gap:8px'

  const label = document.createElement('span')
  label.textContent = metric.label

  const mark = document.createElement('span')
  mark.textContent = VERDICT_MARK[metric.verdict]
  mark.style.color = VERDICT_COLOR[metric.verdict]

  top.append(label, mark)

  const detail = document.createElement('div')
  detail.style.cssText = 'color:#A99C8A;white-space:pre-wrap'
  detail.textContent = `  ${metric.value}   (목표 ${metric.target})`

  row.append(top, detail)
  return row
}

function heading(text: string, color: string): HTMLElement {
  const element = document.createElement('div')
  element.textContent = text
  element.style.cssText = `color:${color};letter-spacing:.06em`
  return element
}

function list(lines: readonly string[]): HTMLElement {
  const element = document.createElement('div')
  element.style.cssText = 'color:#A99C8A;white-space:pre'
  element.textContent = lines.length === 0 ? '  -' : lines.map((line) => `  ${line}`).join('\n')
  return element
}

function divider(): HTMLElement {
  const element = document.createElement('div')
  element.style.cssText = 'height:1px;background:#362B44'
  return element
}
