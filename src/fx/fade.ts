/**
 * 사망 → 부활 사이의 검은 페이드.
 *
 * docs/06 사망 연출의 마지막 박자다 — "t=1250ms 화면 페이드 → 리스폰".
 * 없으면 죽은 자리에서 체크포인트로 카메라가 그냥 튄다. 그 순간이 버그처럼
 * 읽히면 "죽는 연출이 좋았다" 를 물을 수 없다.
 *
 * **덮는 것은 빠르게, 걷는 것은 느리게.** 화면을 가리는 동안 카메라가 옮겨
 * 가야 하므로 덮기는 즉시여야 하고, 걷기는 눈이 따라올 시간을 준다.
 * 그래도 둘을 합쳐 재시작 3초 예산 안에 있어야 한다 → docs/02 2.6
 */

/** 덮는 데 걸리는 시간. 부활 카운트보다 짧아야 카메라 이동을 가린다. */
export const COVER_MS = 140
/** 걷는 데 걸리는 시간. */
export const REVEAL_MS = 260

export interface Fade {
  /** 0 이면 투명, 1 이면 완전한 검정 */
  readonly alpha: number
}

export const NO_FADE: Fade = Object.freeze({ alpha: 0 })

/**
 * 한 프레임 진행.
 *
 * `covering` 이 참이면 검게 덮고, 거짓이면 걷는다. 목표를 향해 선형으로
 * 움직이므로 도중에 방향이 바뀌어도 튀지 않는다 — 부활하자마자 다시 죽는
 * 경우가 실제로 있다.
 */
export function stepFade(fade: Fade, covering: boolean, frameMs: number): Fade {
  const step = Math.max(0, frameMs)
  const target = covering ? 1 : 0
  const span = covering ? COVER_MS : REVEAL_MS
  if (span <= 0) return { alpha: target }

  const delta = step / span
  const moved = fade.alpha < target
    ? Math.min(target, fade.alpha + delta)
    : Math.max(target, fade.alpha - delta)

  // 나눗셈이 쌓이면 0.9999… 에서 멈춘다. 눈에는 같아도 "다 덮었는가" 를
  // 묻는 쪽이 영영 거짓을 받는다.
  const alpha = Math.abs(moved - target) < 1e-6 ? target : moved

  return alpha === fade.alpha ? fade : { alpha }
}
