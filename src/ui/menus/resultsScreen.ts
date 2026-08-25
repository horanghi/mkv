import { stampAt, type Rank, type Results, type Rolling } from '../../game/results.ts'

/**
 * 스테이지 클리어 결과 화면.
 *
 * 표 구성과 롤링은 docs/09 9.4 그대로다. 점수가 한 번에 나타나면 아무 감흥이
 * 없다 — 하나씩 차오르고 마지막에 랭크가 찍히는 2.5초가 보상이다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 ui/ 제외. 숫자는 game/results.ts 에서 검증한다.
 */

export interface ResultsCallbacks {
  /** 아무 키나 눌러 롤링을 건너뛴다 */
  readonly onSkip: () => void
  readonly onContinue: () => void
}

const RANK_COLOR: Readonly<Record<Rank, string>> = {
  S: '#F0C04A', A: '#7FBF6A', B: '#8695AC', C: '#8C8194',
}

export class ResultsScreen {
  private readonly root: HTMLElement
  private readonly title: HTMLElement
  private readonly table: HTMLElement
  private readonly totalRow: HTMLElement
  private readonly rank: HTMLElement
  private readonly continueButton: HTMLButtonElement
  private opened = false

  constructor(parent: HTMLElement, private readonly callbacks: ResultsCallbacks) {
    this.root = document.createElement('div')
    this.root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:16px',
      'background:rgba(6,10,12,.82)',
      'color:#EDE6D8',
      'font:12px/1.8 ui-monospace,SFMono-Regular,Menlo,monospace',
      'z-index:22',
    ].join(';')

    this.title = document.createElement('div')
    this.title.style.cssText = 'font-size:17px;letter-spacing:.32em'

    this.table = document.createElement('div')
    this.table.style.cssText = 'display:grid;grid-template-columns:auto auto auto;gap:2px 20px;font-variant-numeric:tabular-nums'

    this.totalRow = document.createElement('div')
    this.totalRow.style.cssText = [
      'display:flex', 'gap:20px', 'justify-content:space-between',
      'width:100%', 'padding-top:6px', 'border-top:1px solid #3D3049',
      'font-variant-numeric:tabular-nums',
    ].join(';')

    this.rank = document.createElement('div')
    // transition 을 걸지 않는다. 도장 애니메이션은 프레임마다 값을 직접 준다 —
    // CSS 보간과 섞이면 히트스톱(정지 구간)이 뭉개진다.
    this.rank.style.cssText = 'font-size:34px;letter-spacing:.2em;opacity:0;will-change:transform'

    this.continueButton = document.createElement('button')
    this.continueButton.type = 'button'
    this.continueButton.textContent = '계속하기'
    this.continueButton.style.cssText = [
      'padding:8px 18px', 'background:#241C2E', 'border:1px solid #3D3049',
      'color:#BEB4C6', 'font:12px/1.4 inherit', 'cursor:pointer',
    ].join(';')
    this.continueButton.addEventListener('click', () => this.callbacks.onContinue())

    const box = document.createElement('div')
    box.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:280px'
    box.append(this.table, this.totalRow)

    this.root.append(this.title, box, this.rank, this.continueButton)
    parent.appendChild(this.root)

    // 롤링 중 아무 키나 누르면 즉시 완료한다. → docs/09 9.4
    this.root.addEventListener('click', (event) => {
      if (event.target !== this.continueButton) this.callbacks.onSkip()
    })
  }

  get isOpen(): boolean {
    return this.opened
  }

  open(stageName: string): void {
    if (this.opened) return
    this.opened = true
    this.title.textContent = `${stageName} CLEAR`
    this.root.style.display = 'flex'
  }

  close(): void {
    if (!this.opened) return
    this.opened = false
    this.root.style.display = 'none'
    this.rank.style.opacity = '0'
  }

  render(results: Results, rolling: Rolling): void {
    if (!this.opened) return

    this.table.replaceChildren(...rolling.lines.flatMap(({ line, shown }) => [
      cell(line.label, '#A99C8A'),
      cell(line.detail, '#EDE6D8'),
      cell(shown === 0 ? '' : `+ ${shown.toLocaleString('en-US')}`, '#EDE6D8', 'right'),
    ]))

    this.totalRow.replaceChildren(
      cell('TOTAL', '#A99C8A'),
      cell(rolling.total.toLocaleString('en-US'), '#EDE6D8', 'right'),
    )

    this.rank.textContent = `RANK  ${results.rank}`
    this.rank.style.color = RANK_COLOR[results.rank]

    if (!rolling.rankVisible) {
      this.rank.style.opacity = '0'
      this.rank.style.transform = 'none'
      this.rank.style.textShadow = 'none'
      return
    }

    const stamp = stampAt(rolling.stampMs, results.rank)
    this.rank.style.opacity = String(stamp.opacity)
    this.rank.style.transform =
      `translate(${stamp.shakeX.toFixed(2)}px, ${stamp.shakeY.toFixed(2)}px) scale(${stamp.scale.toFixed(3)})`
    // S 랭크만 빛난다.
    this.rank.style.textShadow = stamp.glow > 0
      ? `0 0 ${(10 + stamp.glow * 22).toFixed(0)}px rgba(240,192,74,${(stamp.glow * 0.9).toFixed(2)})`
      : 'none'
  }
}

function cell(text: string, color: string, align: 'left' | 'right' = 'left'): HTMLElement {
  const element = document.createElement('span')
  element.textContent = text
  element.style.cssText = `color:${color};text-align:${align}`
  return element
}
