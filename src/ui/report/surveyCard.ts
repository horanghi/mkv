import type { Survey } from '../../telemetry/session.ts'

/**
 * 테스터가 보는 유일한 계측 화면.
 *
 * 지표를 보여주지 않는다. 재시도율을 재고 있다는 걸 알면 억지로 다시 하고,
 * 프레임을 재고 있다는 걸 알면 프레임을 본다. 물어보는 것은 게이트가 사람에게만
 * 물을 수 있는 두 가지뿐이다. → prompts/m1-gate.md
 *
 * 계측 대상이 아니다 — vitest coverage 에서 ui/ 제외.
 */

export interface SurveyCallbacks {
  readonly onAnswer: (patch: Partial<Survey>) => void
  /** 붙여넣을 결과 문자열을 만든다. 열려 있는 동안 최신값을 쓴다. */
  readonly getPayload: () => string
  readonly onOpenChange: (open: boolean) => void
}

const CARD_STYLE = [
  'position:absolute',
  'left:50%',
  'top:50%',
  'transform:translate(-50%,-50%)',
  'width:min(420px, calc(100% - 32px))',
  'display:none',
  'flex-direction:column',
  'gap:14px',
  'padding:20px 22px',
  'background:#100A17',
  'border:1px solid #3D3049',
  'color:#EDE6D8',
  'font:13px/1.7 ui-sans-serif,-apple-system,"Helvetica Neue",sans-serif',
  'z-index:20',
].join(';')

export class SurveyCard {
  private readonly root: HTMLElement
  private readonly note: HTMLTextAreaElement
  /** 클립보드가 막힌 환경에서 결과를 직접 고를 수 있게 내주는 칸. */
  private readonly fallback: HTMLTextAreaElement
  private readonly copyButton: HTMLButtonElement
  private readonly openButton: HTMLButtonElement
  private readonly choices = new Map<keyof Survey, readonly HTMLButtonElement[]>()
  private opened = false
  private shownOnce = false

  constructor(parent: HTMLElement, private readonly callbacks: SurveyCallbacks) {
    this.root = document.createElement('div')
    this.root.style.cssText = CARD_STYLE

    const title = document.createElement('div')
    title.textContent = '두 가지만 알려주세요'
    title.style.cssText = 'font-size:15px;letter-spacing:.02em'

    this.note = document.createElement('textarea')
    this.note.placeholder = '남기고 싶은 말 (선택)'
    this.note.rows = 3
    this.note.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'resize:vertical',
      'padding:8px 10px',
      'background:#0B0710',
      'border:1px solid #3D3049',
      'color:#EDE6D8',
      'font:12px/1.6 inherit',
    ].join(';')
    this.note.addEventListener('input', () => {
      this.callbacks.onAnswer({ note: this.note.value })
    })

    this.fallback = document.createElement('textarea')
    this.fallback.readOnly = true
    this.fallback.rows = 3
    this.fallback.style.cssText = [
      'display:none',
      'width:100%',
      'box-sizing:border-box',
      'padding:8px 10px',
      'background:#0B0710',
      'border:1px solid #7A5CA8',
      'color:#A99C8A',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
    ].join(';')

    this.copyButton = action('결과 복사', '#7A5CA8')
    this.copyButton.addEventListener('click', () => { void this.copy() })

    const close = action('닫기', '#2A2135')
    close.addEventListener('click', () => this.close())

    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;gap:8px'
    buttons.append(this.copyButton, close)

    this.root.append(
      title,
      this.question('deathFxLiked', '죽는 연출이 마음에 들었나요?', ['좋았다', '아니다']),
      this.question('jumpStiff', '점프가 답답했나요?', ['답답했다', '괜찮았다']),
      this.note,
      this.fallback,
      buttons,
    )
    parent.appendChild(this.root)

    // 끝까지 못 간 사람도 결과를 보낼 수 있어야 한다. 눈에 거슬리지 않게 둔다.
    this.openButton = document.createElement('button')
    this.openButton.textContent = '결과 보내기'
    this.openButton.style.cssText = [
      'position:absolute',
      'right:10px',
      'bottom:10px',
      'display:none',
      'padding:5px 10px',
      'background:rgba(11,7,16,.75)',
      'border:1px solid #3D3049',
      'color:#8C8194',
      'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'cursor:pointer',
      'z-index:14',
    ].join(';')
    this.openButton.addEventListener('click', () => this.open())
    parent.appendChild(this.openButton)
  }

  get isOpen(): boolean {
    return this.opened
  }

  /** 결과 보내기 버튼을 드러낸다. 충분히 죽어 본 다음에만 부른다. */
  revealEntry(): void {
    this.openButton.style.display = 'block'
  }

  /** 클리어했을 때 한 번만 저절로 뜬다. 두 번째 클리어에는 안 뜬다. */
  showOnce(): void {
    if (this.shownOnce) return
    this.shownOnce = true
    this.revealEntry()
    this.open()
  }

  open(): void {
    if (this.opened) return
    this.opened = true
    this.root.style.display = 'flex'
    this.callbacks.onOpenChange(true)
  }

  close(): void {
    if (!this.opened) return
    this.opened = false
    this.root.style.display = 'none'
    this.callbacks.onOpenChange(false)
  }

  private question(
    key: keyof Survey,
    text: string,
    labels: readonly [string, string],
  ): HTMLElement {
    const block = document.createElement('div')
    block.style.cssText = 'display:flex;flex-direction:column;gap:6px'

    const label = document.createElement('div')
    label.textContent = text

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px'

    // 첫 번째 버튼이 곧 true 다. 질문 문구와 값의 방향을 맞춰 뒀다.
    const buttons = labels.map((labelText, index) => {
      const button = action(labelText, '#241C2E')
      button.addEventListener('click', () => {
        this.callbacks.onAnswer({ [key]: index === 0 } as Partial<Survey>)
        this.markChosen(key, index)
      })
      return button
    })

    row.append(...buttons)
    block.append(label, row)
    this.choices.set(key, buttons)
    return block
  }

  private markChosen(key: keyof Survey, chosen: number): void {
    const buttons = this.choices.get(key) ?? []
    buttons.forEach((button, index) => {
      button.style.background = index === chosen ? '#7A5CA8' : '#241C2E'
      button.style.color = index === chosen ? '#FFFFFF' : '#BEB4C6'
    })
  }

  private async copy(): Promise<void> {
    const text = this.callbacks.getPayload()
    try {
      await navigator.clipboard.writeText(text)
      this.copyButton.textContent = '복사했습니다'
    } catch {
      // 클립보드가 막힌 환경(비 HTTPS, 권한 거부)에서는 직접 고를 수 있게 보여준다.
      // 메모 칸을 덮어쓰지 않는다 — 테스터가 쓰던 글이 사라지면 안 된다.
      this.fallback.style.display = 'block'
      this.fallback.value = text
      this.fallback.select()
      this.copyButton.textContent = '직접 복사해 주세요'
    }
    setTimeout(() => { this.copyButton.textContent = '결과 복사' }, 2500)
  }
}

function action(text: string, background: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = text
  button.style.cssText = [
    'flex:1',
    'padding:7px 12px',
    `background:${background}`,
    'border:1px solid #3D3049',
    'color:#BEB4C6',
    'font:12px/1.4 inherit',
    'cursor:pointer',
  ].join(';')
  return button
}
