/**
 * 조작 안내.
 *
 * 첫 입력이 들어오면 사라진다. **게임에 대해 아무것도 설명하지 않는다** —
 * 게이트에서 물을 질문은 "점프가 재미있나요?" 하나뿐이고,
 * 설명이 필요하면 이미 실패한 것이기 때문이다. → prompts/m0-gate.md
 */
export class ControlHint {
  private readonly element: HTMLElement
  private dismissed = false

  constructor(parent: HTMLElement, lines: readonly string[]) {
    this.element = document.createElement('div')
    this.element.style.cssText = [
      'position:absolute',
      'left:50%',
      'bottom:24px',
      'transform:translateX(-50%)',
      'display:flex',
      'flex-direction:column',
      'gap:2px',
      'align-items:center',
      'padding:8px 14px',
      'background:rgba(11,7,16,.8)',
      'color:#A99C8A',
      'font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
      'letter-spacing:.04em',
      'white-space:pre',
      'pointer-events:none',
      'transition:opacity .5s ease',
      'z-index:10',
    ].join(';')
    this.element.textContent = lines.join('\n')
    parent.appendChild(this.element)
  }

  /** 첫 입력에 사라진다. 두 번 호출해도 안전하다. */
  dismiss(): void {
    if (this.dismissed) return
    this.dismissed = true
    this.element.style.opacity = '0'
    setTimeout(() => this.element.remove(), 600)
  }
}
