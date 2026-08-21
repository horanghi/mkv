import { FRAME_BUDGET_MS, LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_RATE } from '../../core/config.ts'

/**
 * 디버그 오버레이 — **스텁**.
 *
 * 지금은 프레임 타임과 틱 카운터만 띄운다. 히트박스·속도 벡터·상태 머신 표시는
 * 그릴 대상(m0-3 타일맵, m0-4 플레이어)이 생긴 다음에 붙인다.
 *
 * 계측 대상이 아니다(vitest coverage 에서 render/ 제외). 시각으로 검증한다.
 * → docs/10-tech-spec.md 10.9, 10.10
 */

export interface DebugMetrics {
  readonly fps: number
  readonly frameMs: number
  readonly logicMs: number
  readonly renderMs: number
  readonly tick: number
  readonly entities: number
  readonly state: string
}

export const EMPTY_METRICS: DebugMetrics = {
  fps: 0,
  frameMs: 0,
  logicMs: 0,
  renderMs: 0,
  tick: 0,
  entities: 0,
  state: '-',
}

export class DebugOverlay {
  private readonly element: HTMLElement
  private visible = true

  constructor(parent: HTMLElement) {
    this.element = document.createElement('pre')
    this.element.style.cssText = [
      'position:absolute',
      'top:8px',
      'left:8px',
      'margin:0',
      'padding:6px 8px',
      'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#EDE6D8',
      'background:rgba(11,7,16,.72)',
      'pointer-events:none',
      'white-space:pre',
      'z-index:10',
    ].join(';')
    parent.appendChild(this.element)
    this.render(EMPTY_METRICS)
  }

  toggle(): void {
    this.visible = !this.visible
    this.element.style.display = this.visible ? 'block' : 'none'
  }

  render(m: DebugMetrics): void {
    if (!this.visible) return
    const over = m.logicMs > FRAME_BUDGET_MS.logic ? ' !' : ''
    this.element.textContent = [
      `${LOGICAL_WIDTH}x${LOGICAL_HEIGHT} @ ${TICK_RATE}Hz`,
      `fps    ${m.fps.toFixed(0)}  frame ${m.frameMs.toFixed(2)}ms`,
      `logic  ${m.logicMs.toFixed(2)}ms${over}  render ${m.renderMs.toFixed(2)}ms`,
      `tick   ${m.tick}  entities ${m.entities}`,
      `state  ${m.state}`,
      // TODO(m0-3): 타일 충돌 질의 박스
      // TODO(m0-4): 히트박스 · 속도 벡터 · 코요테/버퍼 잔여 프레임
    ].join('\n')
  }

  destroy(): void {
    this.element.remove()
  }
}
