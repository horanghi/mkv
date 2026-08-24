import { FRAME_BUDGET_MS, LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_MS, TICK_RATE } from '../../core/config.ts'

/**
 * 디버그 오버레이.
 *
 * 지금은 루프 계측(틱/초, 프레임 그래프, 히트스톱)까지다.
 * 히트박스·속도 벡터는 그릴 대상이 생기는 m0-3, m0-4 에서 붙인다.
 *
 * 계측 대상이 아니다(vitest coverage 에서 render/ 제외). 시각으로 검증한다.
 * → docs/10-tech-spec.md 10.9, 10.10
 */

export interface DebugMetrics {
  readonly fps: number
  readonly frameMs: number
  readonly logicMs: number
  readonly tick: number
  readonly ticksPerSecond: number
  readonly droppedTicks: number
  readonly alpha: number
  readonly hitstopMs: number
  readonly entities: number
  readonly state: string
  /** px/s */
  readonly velocity: readonly [number, number]
  readonly coyoteFrames: number
  readonly jumpBufferFrames: number
  readonly grounded: boolean
  /** "1/2" 형태. 화면 동시 발사 상한이 걸려 있는지 눈으로 본다. */
  readonly shots: string
}

export const EMPTY_METRICS: DebugMetrics = {
  fps: 0,
  frameMs: 0,
  logicMs: 0,
  tick: 0,
  ticksPerSecond: 0,
  droppedTicks: 0,
  alpha: 0,
  hitstopMs: 0,
  entities: 0,
  state: '-',
  velocity: [0, 0],
  coyoteFrames: 0,
  jumpBufferFrames: 0,
  grounded: false,
  shots: '0/0',
}

const GRAPH_WIDTH = 120
const GRAPH_HEIGHT = 34
/** 그래프 세로 상한. 프레임 예산의 두 배까지 보이면 충분하다. */
const GRAPH_MAX_MS = TICK_MS * 2

export class DebugOverlay {
  private readonly root: HTMLElement
  private readonly text: HTMLElement
  private readonly graph: HTMLCanvasElement
  private readonly graphCtx: CanvasRenderingContext2D | null
  private readonly history: number[] = []
  private visible = true

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.style.cssText = [
      'position:absolute',
      'top:8px',
      'left:8px',
      'display:flex',
      'flex-direction:column',
      'gap:4px',
      'padding:6px 8px',
      'background:rgba(11,7,16,.72)',
      'color:#EDE6D8',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'pointer-events:none',
      'white-space:pre',
      'z-index:10',
    ].join(';')

    this.text = document.createElement('div')
    this.root.appendChild(this.text)

    this.graph = document.createElement('canvas')
    this.graph.width = GRAPH_WIDTH
    this.graph.height = GRAPH_HEIGHT
    this.graph.style.cssText = `width:${GRAPH_WIDTH}px;height:${GRAPH_HEIGHT}px;image-rendering:pixelated`
    this.root.appendChild(this.graph)
    this.graphCtx = this.graph.getContext('2d')

    parent.appendChild(this.root)
    this.render(EMPTY_METRICS)
  }

  toggle(): void {
    this.setVisible(!this.visible)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.root.style.display = visible ? 'flex' : 'none'
  }

  render(m: DebugMetrics): void {
    this.push(m.frameMs)
    if (!this.visible) return

    const overBudget = m.logicMs > FRAME_BUDGET_MS.logic
    const tickDrift = Math.abs(m.ticksPerSecond - TICK_RATE) > 0.5

    this.text.textContent = [
      `${LOGICAL_WIDTH}x${LOGICAL_HEIGHT} @ ${TICK_RATE}Hz`,
      `fps    ${m.fps.toFixed(1).padStart(5)}   frame ${m.frameMs.toFixed(2)}ms`,
      `tps    ${m.ticksPerSecond.toFixed(1).padStart(5)}${tickDrift ? ' !' : '  '} logic ${m.logicMs.toFixed(2)}ms${overBudget ? ' !' : ''}`,
      `tick   ${m.tick}  alpha ${m.alpha.toFixed(2)}  drop ${m.droppedTicks}`,
      `stop   ${m.hitstopMs.toFixed(0)}ms  entities ${m.entities}`,
      `state  ${m.state}${m.grounded ? '' : ' (air)'}`,
      `vel    ${m.velocity[0].toFixed(1).padStart(6)} ${m.velocity[1].toFixed(1).padStart(7)}`,
      `coyote ${m.coyoteFrames}  buffer ${m.jumpBufferFrames}  shots ${m.shots}`,
    ].join('\n')

    this.drawGraph()
  }

  destroy(): void {
    this.root.remove()
  }

  private push(frameMs: number): void {
    this.history.push(frameMs)
    if (this.history.length > GRAPH_WIDTH) this.history.shift()
  }

  private drawGraph(): void {
    const ctx = this.graphCtx
    if (!ctx) return

    ctx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT)
    ctx.fillStyle = 'rgba(36,28,46,.9)'
    ctx.fillRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT)

    // 예산선. 막대가 이 선 아래에 붙어 평평하면 정상이다.
    const budgetY = GRAPH_HEIGHT - (TICK_MS / GRAPH_MAX_MS) * GRAPH_HEIGHT
    ctx.fillStyle = '#5F6E85'
    ctx.fillRect(0, Math.round(budgetY), GRAPH_WIDTH, 1)

    for (let i = 0; i < this.history.length; i += 1) {
      const ms = this.history[i] ?? 0
      const h = Math.min(GRAPH_HEIGHT, (ms / GRAPH_MAX_MS) * GRAPH_HEIGHT)
      ctx.fillStyle = ms > TICK_MS * 1.5 ? '#E23E4E' : ms > TICK_MS * 1.1 ? '#F0C04A' : '#8695AC'
      ctx.fillRect(i, GRAPH_HEIGHT - h, 1, h)
    }
  }
}
