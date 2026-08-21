/**
 * 축 정렬 사각형(AABB).
 *
 * `x`, `y` 는 **좌상단**이다. 화면 좌표계와 같아서 타일 격자 계산이 단순해진다.
 *
 * 접촉은 겹침이 아니다. 지면 위에 정확히 서 있는 몸이 그 타일과 "겹쳤다"고 판정되면
 * 매 틱 밀려나는 진동이 생긴다. 그래서 비교는 전부 열린 구간이다.
 */
export interface Aabb {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function right(box: Aabb): number {
  return box.x + box.width
}

export function bottom(box: Aabb): number {
  return box.y + box.height
}

export function centerX(box: Aabb): number {
  return box.x + box.width / 2
}

export function centerY(box: Aabb): number {
  return box.y + box.height / 2
}

/** 면이 맞닿은 것은 겹침이 아니다. */
export function overlaps(a: Aabb, b: Aabb): boolean {
  return a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y
}

export function containsPoint(box: Aabb, x: number, y: number): boolean {
  return x >= box.x && x < right(box) && y >= box.y && y < bottom(box)
}

export function translate(box: Aabb, dx: number, dy: number): Aabb {
  return { ...box, x: box.x + dx, y: box.y + dy }
}

export function fromCenter(cx: number, cy: number, width: number, height: number): Aabb {
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

export function fromEdges(left: number, top: number, r: number, b: number): Aabb {
  return { x: left, y: top, width: r - left, height: b - top }
}

/** 두 상자가 지나간 자리를 모두 덮는 상자. 브로드페이즈 질의 범위로 쓴다. */
export function sweptBounds(from: Aabb, to: Aabb): Aabb {
  const left = Math.min(from.x, to.x)
  const top = Math.min(from.y, to.y)
  return fromEdges(left, top, Math.max(right(from), right(to)), Math.max(bottom(from), bottom(to)))
}
