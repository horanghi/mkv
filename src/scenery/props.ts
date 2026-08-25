import { nextFloat, type RngState } from '../core/rng.ts'

/**
 * 배경 소품 배치 — 묘비, 기둥, 죽은 나무.
 *
 * 실루엣만으로는 층이 판판해 보인다. 서로 다른 높이의 물체가 섞여야
 * 깊이가 생긴다. → docs/06-visual-direction.md 6.2
 */

export interface PropKind {
  readonly name: string
  readonly minWidth: number
  readonly maxWidth: number
  readonly minHeight: number
  readonly maxHeight: number
  /** 뽑힐 상대 확률. 클수록 자주 나온다 */
  readonly weight: number
}

export interface Prop {
  readonly kind: string
  readonly x: number
  readonly width: number
  readonly height: number
  /** 좌우 반전. 같은 모양이 반복되는 티를 줄인다 */
  readonly flipped: boolean
}

export interface ScatterSpec {
  /** 배치 구간의 폭. 이 폭 단위로 반복한다 */
  readonly width: number
  /** 소품 사이의 기본 간격 */
  readonly spacing: number
  /** 간격의 흔들림 (0~1). 0 이면 자로 잰 듯 늘어선다 */
  readonly jitter: number
  readonly kinds: readonly PropKind[]
}

/**
 * 소품을 흩뿌린다.
 *
 * 마지막 소품이 오른쪽 끝을 넘어가면 버린다 — 반복 이음매에서 잘린 묘비가
 * 보이면 배경이 타일이라는 게 드러난다.
 */
export function scatter(seed: RngState, spec: ScatterSpec): readonly Prop[] {
  if (spec.kinds.length === 0 || spec.spacing <= 0) return []

  const total = spec.kinds.reduce((sum, kind) => sum + Math.max(0, kind.weight), 0)
  if (total <= 0) return []

  const out: Prop[] = []
  let state = seed
  let x = spec.spacing / 2

  while (x < spec.width) {
    const kindDraw = nextFloat(state)
    state = kindDraw.state
    const kind = weighted(spec.kinds, kindDraw.value * total)

    const wDraw = nextFloat(state)
    state = wDraw.state
    const width = Math.round(kind.minWidth + wDraw.value * (kind.maxWidth - kind.minWidth))

    const hDraw = nextFloat(state)
    state = hDraw.state
    const height = Math.round(kind.minHeight + hDraw.value * (kind.maxHeight - kind.minHeight))

    const flipDraw = nextFloat(state)
    state = flipDraw.state

    if (x + width <= spec.width) {
      out.push({ kind: kind.name, x: Math.round(x), width, height, flipped: flipDraw.value < 0.5 })
    }

    const gapDraw = nextFloat(state)
    state = gapDraw.state
    x += spec.spacing * (1 + (gapDraw.value - 0.5) * 2 * spec.jitter)
  }

  return out
}

function weighted(kinds: readonly PropKind[], target: number): PropKind {
  let seen = 0
  for (const kind of kinds) {
    seen += Math.max(0, kind.weight)
    if (target < seen) return kind
  }
  return kinds[kinds.length - 1] as PropKind
}
