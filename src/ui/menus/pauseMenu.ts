import { DIFFICULTIES, rulesFor, type Difficulty } from '../../game/difficulty.ts'

/**
 * 일시정지 메뉴.
 *
 * docs/09 9.3 의 구성이다. "설정 / 타이틀로" 는 M1 에 그 화면이 없으므로
 * 두지 않았다 — 없는 곳으로 가는 버튼을 만드는 것보다 없는 편이 낫다.
 * 대신 조작법을 항상 띄운다. docs/09 9.6 이 "막힌 플레이어를 위해
 * 일시정지 메뉴에 조작법을 두는 것으로 충분하다"고 정했다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 ui/ 제외. 상태는 game/pause.ts 에서 검증한다.
 */

export interface PauseCallbacks {
  readonly onResume: () => void
  readonly onRestart: () => void
  /** 난이도를 바꾼다. 바꾸면 판이 다시 시작된다 */
  readonly onDifficulty: (difficulty: Difficulty) => void
}

const PANEL = [
  'position:absolute',
  'inset:0',
  'display:none',
  'flex-direction:column',
  'align-items:center',
  'justify-content:center',
  'gap:18px',
  // 게임 화면이 남아 보여야 한다. 어둡게 덮으면 블러·채도를 건 의미가 없다.
  'background:rgba(8,12,14,.42)',
  'color:#EDE6D8',
  'font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace',
  'z-index:18',
].join(';')

const COUNTDOWN = [
  'position:absolute',
  'inset:0',
  'display:none',
  'align-items:center',
  'justify-content:center',
  'color:#EDE6D8',
  'font:64px/1 ui-monospace,SFMono-Regular,Menlo,monospace',
  'text-shadow:0 0 18px rgba(168,111,242,.7)',
  'pointer-events:none',
  'z-index:19',
].join(';')

export class PauseMenu {
  private readonly panel: HTMLElement
  private readonly countdown: HTMLElement
  private readonly difficultyButtons = new Map<Difficulty, HTMLButtonElement>()

  constructor(parent: HTMLElement, callbacks: PauseCallbacks) {
    this.panel = document.createElement('div')
    this.panel.style.cssText = PANEL

    const title = document.createElement('div')
    title.textContent = '일시정지'
    title.style.cssText = 'font-size:18px;letter-spacing:.3em'

    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:180px'
    buttons.append(
      button('계속하기', () => callbacks.onResume()),
      button('처음부터', () => callbacks.onRestart()),
    )

    // 난이도. docs/09 9.6 이 설정을 일시정지 메뉴에 두기로 정했다.
    const difficultyLabel = document.createElement('div')
    difficultyLabel.textContent = '난이도'
    difficultyLabel.style.cssText = 'color:#8C8194;font-size:11px;letter-spacing:.2em'

    const difficultyRow = document.createElement('div')
    difficultyRow.style.cssText = 'display:flex;gap:6px'
    for (const id of DIFFICULTIES) {
      const rules = rulesFor(id)
      const element = button(rules.name, () => callbacks.onDifficulty(id))
      element.title = `${rules.forWhom} · 잔기 ${rules.lives} · ${rules.stageTimeSeconds / 60}분 · 체크포인트 ${rules.checkpoints}`
      element.style.flex = '1'
      element.style.padding = '6px 4px'
      // 세 글자(성기사)가 줄바꿈되지 않아야 한다
      element.style.whiteSpace = 'nowrap'
      this.difficultyButtons.set(id, element)
      difficultyRow.appendChild(element)
    }

    // 바꾸면 계측 세션이 새로 시작된다. 되돌릴 수 없으므로 누르는 자리에 적는다.
    const difficultyWarning = document.createElement('div')
    difficultyWarning.textContent = '바꾸면 플레이테스트 기록이 처음부터 다시 시작됩니다'
    difficultyWarning.style.cssText = 'color:#6E6478;font-size:10px;letter-spacing:.02em'

    const difficultyBlock = document.createElement('div')
    difficultyBlock.style.cssText = 'display:flex;flex-direction:column;gap:5px;width:260px;align-items:center'
    difficultyBlock.append(difficultyLabel, difficultyRow, difficultyWarning)

    const help = document.createElement('div')
    help.style.cssText = 'color:#8C8194;white-space:pre;text-align:center;font-size:11px;line-height:1.9'
    help.textContent = [
      '←  →   이동          Z   점프',
      'X  던지기            ↓   웅크리기',
      'Esc  일시정지        R   처음부터',
    ].join('\n')

    this.panel.append(title, buttons, difficultyBlock, help)
    parent.appendChild(this.panel)

    this.countdown = document.createElement('div')
    this.countdown.style.cssText = COUNTDOWN
    parent.appendChild(this.countdown)
  }

  /** 매 프레임. 메뉴와 카운트다운은 동시에 뜨지 않는다. */
  render(menuOpen: boolean, countdownNumber: number | null, difficulty: Difficulty): void {
    this.panel.style.display = menuOpen ? 'flex' : 'none'
    this.countdown.style.display = countdownNumber === null ? 'none' : 'flex'
    if (countdownNumber !== null) this.countdown.textContent = String(countdownNumber)

    for (const [id, element] of this.difficultyButtons) {
      const chosen = id === difficulty
      element.style.background = chosen ? '#7A5CA8' : '#241C2E'
      element.style.color = chosen ? '#FFFFFF' : '#BEB4C6'
    }
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  element.style.cssText = [
    'padding:9px 14px',
    'background:#241C2E',
    'border:1px solid #3D3049',
    'color:#BEB4C6',
    'font:12px/1.4 inherit',
    'cursor:pointer',
  ].join(';')
  element.addEventListener('click', onClick)
  return element
}
