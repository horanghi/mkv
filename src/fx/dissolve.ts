import { SPRITE_SIZE, TRANSPARENT, type Matrix } from '../sprite/matrix.ts'

/**
 * 디졸브 — 매트릭스 하나가 다른 하나로 픽셀 단위로 바뀐다.
 *
 * 백골화(살점이 벗겨지는 8프레임)를 손으로 찍지 않고 만든다.
 * 무작위로 흩뿌리면 노이즈로 보이므로 **바깥에서 안으로** 벗겨지게 한다 —
 * 팔다리 끝부터 드러나고 몸통이 마지막에 남는 것이 살이 벗겨지는 순서다.
 * → docs/06-visual-direction.md 6.3 사망 연출
 */

/**
 * 진행도 [0,1] 에 따라 `from` 을 `to` 로 바꾼다.
 *
 * 결정론적이다 — 같은 seed 와 진행도면 언제나 같은 결과다. 리플레이가 깨지지 않는다.
 */
export function dissolve(from: Matrix, to: Matrix, progress: number, seed = 1): Matrix {
  const t = clamp01(progress)
  if (t <= 0) return from
  if (t >= 1) return to

  const height = Math.max(from.length, to.length)
  const center = SPRITE_SIZE / 2
  const maxDistance = Math.hypot(center, center)
  const out: string[] = []

  for (let y = 0; y < height; y += 1) {
    const fromRow = from[y] ?? ''
    const toRow = to[y] ?? ''
    const width = Math.max(fromRow.length, toRow.length)
    let row = ''

    for (let x = 0; x < width; x += 1) {
      const fromCh = fromRow[x] ?? TRANSPARENT
      const toCh = toRow[x] ?? TRANSPARENT

      // 중심에서 멀수록 먼저 벗겨진다.
      const distance = Math.hypot(x - center, y - center) / maxDistance
      const threshold = noise(x, y, seed) * 0.45 + (1 - distance) * 0.55
      row += t >= threshold ? toCh : fromCh
    }
    out.push(row)
  }
  return out
}

/** 8프레임 백골화의 n 번째 프레임. */
export function skeletonizeFrame(
  flesh: Matrix,
  bones: Matrix,
  frame: number,
  frameCount = 8,
  seed = 1,
): Matrix {
  return dissolve(flesh, bones, (frame + 1) / frameCount, seed)
}

/** 좌표당 고정 난수 [0,1). 상태를 들지 않아 어느 프레임에서 불러도 같다. */
function noise(x: number, y: number, seed: number): number {
  let h = Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return ((h >>> 0) % 100000) / 100000
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.min(1, Math.max(0, v))
}
