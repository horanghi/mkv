/**
 * 게임 오버 화면.
 *
 * **잔기가 0 일 때만 뜬다.** 남아 있으면 어떤 UI 도 끼어들지 않는다 —
 * 재시작 마찰이 재시도율을 그대로 깎기 때문이다.
 * → docs/09 9.3 · prompts/m1-gate.md
 *
 * 계측 대상이 아니다 — vitest coverage 에서 ui/ 제외.
 */

export interface GameOverCallbacks {
  /** 마지막 체크포인트에서 이어 한다. 지나온 거리는 잃지 않는다 */
  readonly onContinue: () => void
  readonly onRestart: () => void
}

export class GameOverScreen {
  private readonly root: HTMLElement
  private opened = false

  constructor(parent: HTMLElement, callbacks: GameOverCallbacks) {
    this.root = document.createElement('div')
    this.root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:18px',
      'background:rgba(10,4,6,.78)',
      'color:#EDE6D8',
      'font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace',
      'z-index:21',
    ].join(';')

    const title = document.createElement('div')
    title.textContent = 'GAME OVER'
    title.style.cssText = 'font-size:26px;letter-spacing:.34em;color:#C23B4A'

    const note = document.createElement('div')
    note.textContent = '마지막 체크포인트에서 이어 합니다'
    note.style.cssText = 'color:#8C8194;font-size:11px'

    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:200px'
    buttons.append(
      button('이어하기', () => callbacks.onContinue()),
      button('처음부터', () => callbacks.onRestart()),
    )

    this.root.append(title, note, buttons)
    parent.appendChild(this.root)
  }

  get isOpen(): boolean {
    return this.opened
  }

  open(): void {
    if (this.opened) return
    this.opened = true
    this.root.style.display = 'flex'
  }

  close(): void {
    if (!this.opened) return
    this.opened = false
    this.root.style.display = 'none'
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
