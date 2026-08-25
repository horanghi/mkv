import { ACTIONS, bitOf, type Action, type InputFrame } from './input.ts'

/**
 * 키보드 → `InputFrame` 변환.
 *
 * DOM 이벤트를 모으기만 하고 해석은 하지 않는다. 해석은 `input.ts` 가 한다.
 * `EventTarget` 을 주입받으므로 브라우저 없이도 테스트할 수 있다.
 *
 * → docs/09-ui-ux-controls.md 9.1
 */

export type Bindings = Readonly<Record<string, Action>>

export const DEFAULT_BINDINGS: Bindings = Object.freeze({
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyZ: 'jump',
  Space: 'jump',
  KeyX: 'attack',
  KeyJ: 'attack',
  KeyC: 'sigil',
  KeyK: 'sigil',
  Escape: 'pause',
  Enter: 'pause',
  KeyR: 'restart',
})

/** 브라우저 기본 동작(스크롤 등)을 막아야 하는 키. docs/09 입력 처리 요구사항. */
const SWALLOW_DEFAULT = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'Enter',
])

interface KeyLikeEvent {
  readonly code: string
  readonly repeat?: boolean
  preventDefault(): void
}

export interface KeyboardTarget {
  addEventListener(type: string, listener: (event: Event) => void): void
  removeEventListener(type: string, listener: (event: Event) => void): void
}

export class KeyboardSource {
  private held = 0
  /**
   * 멈춤 상태.
   *
   * 설문 카드처럼 화면 위의 입력창에 글을 쓸 때 켠다. 이게 없으면 메모를
   * 적는 동안 랜슬이 점프하고 창을 던진다.
   */
  private suspended = false
  /**
   * 마지막 폴링 이후 눌린 적이 있는 액션.
   *
   * 한 틱보다 짧게 눌렸다 떼어진 입력을 살리기 위한 것이다.
   * 이게 없으면 히트스톱이나 프레임 드랍 중의 탭이 통째로 사라진다.
   */
  private pressedSincePoll = 0
  private readonly bound: readonly [string, (event: Event) => void][]

  constructor(
    private readonly target: KeyboardTarget,
    private readonly bindings: Bindings = DEFAULT_BINDINGS,
  ) {
    this.bound = [
      ['keydown', (e) => this.onKeyDown(e as unknown as KeyLikeEvent)],
      ['keyup', (e) => this.onKeyUp(e as unknown as KeyLikeEvent)],
      ['blur', () => this.reset()],
    ]
    for (const [type, listener] of this.bound) {
      this.target.addEventListener(type, listener)
    }
  }

  /** 현재 프레임 입력을 뽑고 "눌린 적 있음" 기록을 비운다. */
  poll(): InputFrame {
    const frame = this.held | this.pressedSincePoll
    this.pressedSincePoll = 0
    return frame
  }

  /**
   * 입력을 멈추거나 다시 받는다.
   *
   * 멈출 때 눌린 상태를 비운다 — 안 그러면 카드를 닫는 순간 유령 입력이 나간다.
   */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended
    if (suspended) this.reset()
  }

  /** 창 포커스를 잃었을 때. 누른 채로 남아 캐릭터가 계속 달리는 것을 막는다. */
  reset(): void {
    this.held = 0
    this.pressedSincePoll = 0
  }

  destroy(): void {
    for (const [type, listener] of this.bound) {
      this.target.removeEventListener(type, listener)
    }
    this.reset()
  }

  private onKeyDown(event: KeyLikeEvent): void {
    if (this.suspended) return
    const action = this.bindings[event.code]
    if (action === undefined) return
    if (SWALLOW_DEFAULT.has(event.code)) event.preventDefault()
    // 키 리핏은 "누르고 있음"이지 새 입력이 아니다.
    if (event.repeat === true) return

    const bit = bitOf(action)
    this.held |= bit
    this.pressedSincePoll |= bit
  }

  private onKeyUp(event: KeyLikeEvent): void {
    if (this.suspended) return
    const action = this.bindings[event.code]
    if (action === undefined) return
    if (SWALLOW_DEFAULT.has(event.code)) event.preventDefault()
    this.held &= ~bitOf(action)
  }
}

/** 바인딩이 실제 액션만 가리키는지 검사한다. 사용자 키 리맵을 받을 때 쓴다. */
export function validateBindings(bindings: Bindings): readonly string[] {
  const known = new Set<string>(ACTIONS)
  return Object.entries(bindings)
    .filter(([, action]) => !known.has(action))
    .map(([code]) => code)
}
