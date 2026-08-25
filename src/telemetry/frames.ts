/**
 * 프레임 타임 집계.
 *
 * m1-gate 의 "60fps 유지율 95%" 를 재기 위한 것이다. 개별 프레임을 전부
 * 들고 있으면 장시간 플레이에서 메모리가 늘고 저장도 못 하므로,
 * **1ms 히스토그램**으로 모은다. 백분위는 히스토그램에서 뽑는다.
 *
 * → prompts/m1-gate.md
 */

/** 히스토그램 칸 수. 마지막 칸은 이 값 이상 전부를 담는 넘침 칸이다. */
export const BUCKETS = 64

/**
 * 이 시간 안에 들어온 프레임을 "60fps 를 지켰다"고 본다.
 *
 * 60Hz 에서 vsync 를 한 번 놓치면 33.3ms 가 된다. 16.7 과 33.3 사이의
 * 20ms 는 명중과 실패를 깔끔히 가른다. 120Hz 화면에서는 8.3ms 가 기본이라
 * 한 번 놓쳐도(16.7ms) 통과하는데, 그건 의도한 것이다 — 재는 것은
 * "화면이 60을 유지했는가"이지 "패널의 상한을 채웠는가"가 아니다.
 */
export const FRAME_HELD_MS = 20

/**
 * 이보다 긴 간격은 계측에서 버린다.
 *
 * 탭을 감추면 브라우저가 rAF 를 멈춘다. 돌아왔을 때의 첫 간격은 수 초짜리가
 * 되는데, 이건 성능이 아니라 브라우저 동작이다. 끊김으로 세면 유지율이
 * 거짓으로 무너진다.
 */
export const FRAME_DISCARD_MS = 250

/** 시작 직후 이만큼의 프레임은 버린다. 셰이더 컴파일·텍스처 업로드 구간이다. */
export const WARMUP_FRAMES = 90

export interface FrameStats {
  /** 집계에 들어간 프레임 수 */
  readonly samples: number
  /** 그중 FRAME_HELD_MS 이하인 프레임 수 */
  readonly held: number
  /** 워밍업·탭 전환으로 버린 프레임 수 */
  readonly discarded: number
  /** 1ms 단위 히스토그램. index 가 곧 ms 이고 마지막 칸은 넘침. */
  readonly buckets: readonly number[]
  readonly worstMs: number
}

export const EMPTY_FRAMES: FrameStats = Object.freeze({
  samples: 0,
  held: 0,
  discarded: 0,
  buckets: Object.freeze(new Array<number>(BUCKETS).fill(0)) as readonly number[],
  worstMs: 0,
})

/** 프레임 하나를 집계에 넣는다. 새 객체를 돌려준다. */
export function pushFrame(stats: FrameStats, frameMs: number): FrameStats {
  const warming = stats.samples + stats.discarded < WARMUP_FRAMES
  if (warming || frameMs >= FRAME_DISCARD_MS || !Number.isFinite(frameMs) || frameMs < 0) {
    return { ...stats, discarded: stats.discarded + 1 }
  }

  const index = Math.min(BUCKETS - 1, Math.floor(frameMs))
  const buckets = stats.buckets.slice()
  buckets[index] = (buckets[index] ?? 0) + 1

  return {
    ...stats,
    samples: stats.samples + 1,
    held: stats.held + (frameMs <= FRAME_HELD_MS ? 1 : 0),
    buckets,
    worstMs: Math.max(stats.worstMs, frameMs),
  }
}

/** 60fps 유지율 (0~1). 표본이 없으면 0. */
export function heldRate(stats: FrameStats): number {
  return stats.samples === 0 ? 0 : stats.held / stats.samples
}

/**
 * 백분위 프레임 타임 (ms).
 *
 * 히스토그램에서 뽑으므로 1ms 해상도다. p95 를 볼 때 그 정도면 충분하다.
 * 넘침 칸에 걸리면 실측 최악값을 돌려준다 — 63ms 라고 하면 거짓말이 된다.
 */
export function percentileMs(stats: FrameStats, q: number): number {
  if (stats.samples === 0) return 0

  const target = q * stats.samples
  let seen = 0
  for (let i = 0; i < BUCKETS; i += 1) {
    seen += stats.buckets[i] ?? 0
    if (seen >= target) return i === BUCKETS - 1 ? stats.worstMs : i + 1
  }
  return stats.worstMs
}

/** 평균 fps. 히스토그램의 무게중심에서 역산한다. */
export function averageFps(stats: FrameStats): number {
  if (stats.samples === 0) return 0

  let totalMs = 0
  for (let i = 0; i < BUCKETS; i += 1) {
    const count = stats.buckets[i] ?? 0
    // 칸의 대표값은 그 칸의 중앙이다. 넘침 칸만 실측 최악값을 쓴다.
    totalMs += count * (i === BUCKETS - 1 ? stats.worstMs : i + 0.5)
  }
  return totalMs === 0 ? 0 : (stats.samples / totalMs) * 1000
}
