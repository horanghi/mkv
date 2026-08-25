/**
 * "키보드가 필요합니다" 안내.
 *
 * 폰으로 링크를 열었을 때 뜬다. 조작이 키보드뿐이라 그대로 두면 가만히
 * 서 있는 화면만 보게 되고, 사망이 없으니 결과를 보내는 버튼도 뜨지 않는다.
 * **테스터를 잃는 대신 다시 오게 만드는 것**이 이 화면의 일이다.
 *
 * 닫을 수 있게 둔다 — 판정이 틀렸을 때 게임을 막아 버리면 더 나쁘다.
 *
 * 계측 대상이 아니다 — vitest coverage 에서 ui/ 제외.
 */

export class KeyboardNotice {
  private readonly root: HTMLElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:14px',
      'padding:24px',
      'box-sizing:border-box',
      'text-align:center',
      'background:rgba(10,4,6,.92)',
      'color:#EDE6D8',
      'font:13px/1.8 ui-monospace,SFMono-Regular,Menlo,monospace',
      'z-index:40',
    ].join(';')

    const title = document.createElement('div')
    title.textContent = '키보드가 필요합니다'
    title.style.cssText = 'font-size:17px;letter-spacing:.18em'

    const body = document.createElement('div')
    body.textContent = '방향키와 Z · X 로 하는 게임이라 폰에서는 움직일 수 없습니다.\n노트북이나 데스크톱에서 같은 주소를 열어 주세요.'
    body.style.cssText = 'color:#BEB4C6;font-size:12px;white-space:pre-line;max-width:340px'

    const close = document.createElement('button')
    close.textContent = '그래도 볼래요'
    close.style.cssText = [
      'margin-top:4px',
      'padding:8px 16px',
      'border:0',
      'border-radius:3px',
      'background:#241C2E',
      'color:#BEB4C6',
      'font:11px ui-monospace,SFMono-Regular,Menlo,monospace',
      'cursor:pointer',
    ].join(';')
    close.addEventListener('click', () => this.close())

    this.root.append(title, body, close)
    parent.appendChild(this.root)
  }

  show(): void {
    this.root.style.display = 'flex'
  }

  close(): void {
    this.root.style.display = 'none'
  }
}
