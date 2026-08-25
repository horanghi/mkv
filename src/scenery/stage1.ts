import type { PropKind, ScatterSpec } from './props.ts'
import type { RidgeSpec } from './silhouette.ts'

/**
 * 스테이지 1 (묘지) 의 배경 층.
 *
 * 패럴랙스 계수와 층 순서는 `docs/06-visual-direction.md` 6.2 표를 그대로 옮긴 것이고,
 * 색은 6.6 의 S1 팔레트(청록 `#1a2f2e` · 보조 `#2d4a52` · 강조 `#a86ff2`)에서 왔다.
 *
 * **명도 규칙**: 배경은 전부 게임플레이 타일보다 어둡다.
 * "이게 발판인가 배경인가"를 헷갈리는 순간 게임은 실패한다. → 6.2
 */

/**
 * S1 팔레트.
 *
 * docs/06 6.6 의 세 색을 이렇게 나눠 쓴다.
 *   주색 `#1a2f2e` → 하늘 지평선 (대기)
 *   보조색 `#2d4a52` → 밟을 수 있는 타일
 *   강조 `#a86ff2` → 도깨비불
 *
 * 실루엣 층은 주색을 단계적으로 어둡게 한 것이다. 하늘을 등지고 가까워질수록
 * 어두워진다 — 그래야 네 층이 겹쳐도 앞뒤가 읽힌다.
 */
export const S1_PALETTE = {
  /** 하늘 위쪽 */
  skyTop: 0x1b3038,
  /** 하늘 아래쪽 — 실루엣이 등질 배경. 화면에서 가장 넓은 면이다 */
  skyBottom: 0x3a6b6e,
  far: 0x1a3033,
  /** 성채 실루엣 — 산맥보다 한 단 어둡다 */
  farCastle: 0x142629,
  mid: 0x0f1d20,
  /** 가장 가까운 배경이 가장 어둡다 */
  near: 0x0a1517,
  /** 보조색 계열 — 밟을 수 있는 타일 */
  ground: 0x33565f,
  /** 타일 윗면. 화면에서 가장 밝다 — 밟을 곳이라는 뜻이다 */
  groundLip: 0x6d9dab,
  /** 강조 인광 */
  wisp: 0xa86ff2,
  fog: 0x0d1a1c,
  bars: 0x070f10,
  /**
   * 빛이 닿지 않는 곳의 밝기 (곱하기).
   *
   * 광원 층은 씬 위에 **곱하기**로 얹히므로 이 값이 곧 화면 전체의 밝기다.
   * 낮게 잡으면 밤 분위기가 아니라 그냥 안 보이는 화면이 된다 —
   * 광원이 만드는 대비도 함께 죽는다(최대 배율 = 1/ambient).
   * 차가운 쪽으로 살짝 기울여 묘지의 한기를 남긴다.
   */
  ambient: 0xc4ccd0,
} as const

/** 각 층의 패럴랙스 계수. docs/06 6.2 표. */
export const PARALLAX = {
  sky: 0,
  far: 0.1,
  mid: 0.35,
  near: 0.6,
  gameplay: 1,
  foreground: 1.4,
} as const

export interface RidgeLayer {
  readonly kind: 'ridge'
  readonly name: string
  readonly parallax: number
  readonly color: number
  readonly seed: number
  /** 논리 화면 아래에서 잰 바닥선 (px). 클수록 아래에 깔린다 */
  readonly baseY: number
  readonly ridge: RidgeSpec
}

export interface PropLayer {
  readonly kind: 'props'
  readonly name: string
  readonly parallax: number
  readonly color: number
  readonly seed: number
  readonly baseY: number
  readonly scatter: ScatterSpec
}

export type SceneryLayer = RidgeLayer | PropLayer

/** 묘비·기둥. 근경에 놓여 깊이를 만든다. */
const GRAVE_KINDS: readonly PropKind[] = [
  { name: 'stone', minWidth: 5, maxWidth: 9, minHeight: 8, maxHeight: 16, weight: 5 },
  { name: 'cross', minWidth: 7, maxWidth: 11, minHeight: 14, maxHeight: 22, weight: 3 },
  { name: 'pillar', minWidth: 6, maxWidth: 8, minHeight: 26, maxHeight: 40, weight: 2 },
]

/** 죽은 나무. 중경에 성기게 선다. */
const TREE_KINDS: readonly PropKind[] = [
  { name: 'tree', minWidth: 10, maxWidth: 18, minHeight: 30, maxHeight: 54, weight: 4 },
  { name: 'crypt', minWidth: 22, maxWidth: 40, minHeight: 20, maxHeight: 34, weight: 3 },
]

/**
 * 뒤에서 앞으로. 그리는 순서가 곧 이 배열의 순서다.
 *
 * 반복 폭(`width`)을 층마다 다른 소수로 잡았다. 같은 폭이면 여러 층의
 * 이음매가 한 지점에서 겹쳐 세로줄이 보인다.
 */
export const S1_SCENERY: readonly SceneryLayer[] = [
  {
    kind: 'ridge',
    name: '원경 — 산맥',
    parallax: PARALLAX.far,
    color: S1_PALETTE.far,
    seed: 20260825,
    baseY: 74,
    ridge: { width: 317, steps: 5, minHeight: 34, maxHeight: 92, jag: 0.35 },
  },
  {
    kind: 'ridge',
    name: '원경 — 성채 실루엣',
    parallax: PARALLAX.far + 0.06,
    color: S1_PALETTE.farCastle,
    seed: 771,
    baseY: 62,
    ridge: { width: 419, steps: 9, minHeight: 12, maxHeight: 46, jag: 0.85 },
  },
  {
    kind: 'props',
    name: '중경 — 죽은 나무와 납골당',
    parallax: PARALLAX.mid,
    color: S1_PALETTE.mid,
    seed: 4231,
    baseY: 48,
    scatter: { width: 523, spacing: 74, jitter: 0.45, kinds: TREE_KINDS },
  },
  {
    kind: 'props',
    name: '근경 — 무덤과 기둥',
    parallax: PARALLAX.near,
    color: S1_PALETTE.near,
    seed: 9137,
    baseY: 30,
    scatter: { width: 613, spacing: 46, jitter: 0.5, kinds: GRAVE_KINDS },
  },
]

/**
 * 하늘 구름 — 8층 중 1층의 "노이즈" 자리.
 *
 * 아주 옅게, 아주 느리게 흐른다. 눈에 띄면 하늘이 아니라 무늬가 된다.
 */
export const CLOUDS = {
  seed: 5501,
  spanX: 700,
  count: 9,
  minY: 14,
  maxY: 110,
  minWidth: 70,
  maxWidth: 190,
  minHeight: 2,
  maxHeight: 8,
  color: 0x4d7b7d,
  /** 초당 몇 px 흐르는가. 바람이 아니라 시간의 흐름이다 */
  driftPxPerSecond: 3.2,
} as const

/**
 * 전경 나뭇가지 — 8층 중 7층.
 *
 * **HUD 바 아래에 걸린다.** 화면 맨 위는 HUD 가 덮고 있어서 거기 그리면
 * 통째로 가려진다. 시작 y 는 렌더러가 HUD 높이로 넣는다.
 *
 * **게임플레이 위에 얹히므로 랜슬을 가리면 안 된다.** 스테이지 1 에서
 * 플레이어가 가장 높이 오르는 지점보다 위다 — 오클루전으로 깊이를 만들되
 * 판독을 방해하지 않는 선이다. → docs/06 6.2
 */
export const CANOPY = {
  parallax: PARALLAX.foreground,
  seed: 8821,
  spanX: 389,
  color: S1_PALETTE.bars,
  /** 걸린 자리에서 내려오는 최대 깊이 (px) */
  maxDepth: 10,
  minDepth: 3,
} as const

/**
 * 도깨비불.
 *
 * 묘지에서 유일하게 밝은 것. 강조색을 여기에만 쓴다 — 발광 마스크를 타고
 * 블룸까지 가므로, 여러 곳에 뿌리면 화면이 보라색으로 뜬다. → docs/06 6.4
 */
export const WISPS = {
  count: 14,
  /** 반복 구간 폭 */
  spanX: 760,
  minY: 60,
  maxY: 200,
  parallax: PARALLAX.mid,
  radius: 1.5,
  /** 위아래로 떠다니는 폭 (px) */
  driftY: 9,
  /** 한 번 오르내리는 데 걸리는 시간 (초) */
  periodSeconds: 5.5,
  color: S1_PALETTE.wisp,
} as const

/**
 * 전경 안개.
 *
 * 8층 중 7층. 게임플레이 위에 얹혀 화면 아래쪽을 덮는다. 오클루전이지
 * 장식이 아니다 — 랜슬을 가리면 안 되므로 아주 얕게만 깐다.
 */
export const FOG = {
  parallax: PARALLAX.foreground,
  color: S1_PALETTE.fog,
  /** 화면 아래에서부터의 높이. 랜슬 키(26px)의 절반을 넘기지 않는다 */
  height: 13,
  alpha: 0.5,
  /** 반복 구간 폭 */
  spanX: 240,
} as const
