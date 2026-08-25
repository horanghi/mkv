/**
 * 도트 매트릭스 — 문자열 배열로 표현한 픽셀 격자.
 *
 * 한 글자가 픽셀 하나이고 값은 팔레트 인덱스다. `.` 은 투명이다.
 *
 * **로드 시점에 모양을 검증한다.** 행 하나가 한 글자 짧으면 그 아래가 통째로
 * 밀리는데, 화면에서는 "어딘가 이상하다"로만 보여 원인을 찾기 어렵다.
 * → docs/12-sprites.md
 */

export type Matrix = readonly string[]

/** 스프라이트 캔버스 한 변. 랜슬·잡몹 공통. */
export const SPRITE_SIZE = 32

export const TRANSPARENT = '.'

export class MatrixError extends Error {
  constructor(
    /** 문제가 난 파츠 이름. 어느 매트릭스인지 알아야 고칠 수 있다. */
    readonly part: string,
    message: string,
  ) {
    super(`${part}: ${message}`)
    this.name = 'MatrixError'
  }
}

/** 모든 행의 길이가 같은 직사각형인지 확인한다. 빈 매트릭스는 허용한다(속옷의 투구 깃털). */
export function validateMatrix(name: string, matrix: Matrix): Matrix {
  if (matrix.length === 0) return matrix

  const width = matrix[0]?.length ?? 0
  if (width === 0) throw new MatrixError(name, '첫 행이 비어 있다')

  matrix.forEach((row, y) => {
    if (row.length !== width) {
      throw new MatrixError(name, `행 ${y} 의 길이가 ${row.length} 다 — ${width} 여야 한다`)
    }
  })
  return matrix
}

/** 조립된 프레임이 정확히 32×32 인지 확인한다. */
export function validateFrame(name: string, frame: Matrix): Matrix {
  if (frame.length !== SPRITE_SIZE) {
    throw new MatrixError(name, `높이가 ${frame.length} 다 — ${SPRITE_SIZE} 여야 한다`)
  }
  frame.forEach((row, y) => {
    if (row.length !== SPRITE_SIZE) {
      throw new MatrixError(name, `행 ${y} 의 폭이 ${row.length} 다 — ${SPRITE_SIZE} 여야 한다`)
    }
  })
  return frame
}

/** 매트릭스 묶음을 한 번에 검증한다. 이름이 붙어야 오류를 추적할 수 있다. */
export function validateAll(label: string, parts: Readonly<Record<string, Matrix>>): void {
  for (const [key, matrix] of Object.entries(parts)) {
    validateMatrix(`${label}.${key}`, matrix)
  }
}

export function widthOf(matrix: Matrix): number {
  return matrix[0]?.length ?? 0
}

export function heightOf(matrix: Matrix): number {
  return matrix.length
}

/**
 * 빈 격자. 가변 배열이며 `stamp` 로 채운 뒤 얼린다.
 *
 * 기본은 32×32(랜슬·잡몹)이고, 보스처럼 정사각이 아닌 캔버스는 높이를 따로 준다.
 */
export function blankFrame(width: number = SPRITE_SIZE, height: number = width): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => TRANSPARENT))
}

/**
 * 파츠를 격자에 찍는다. 투명 픽셀은 건너뛰므로 뒤 파츠가 비쳐 보인다.
 *
 * 격자 밖으로 나간 부분은 잘린다 — 오프셋이 커도 터지지 않는다.
 */
export function stamp(grid: string[][], matrix: Matrix, x0: number, y0: number): string[][] {
  matrix.forEach((row, dy) => {
    const y = y0 + dy
    const line = grid[y]
    if (!line) return
    for (let dx = 0; dx < row.length; dx += 1) {
      const ch = row[dx]
      if (ch === undefined || ch === TRANSPARENT) continue
      const x = x0 + dx
      if (x < 0 || x >= line.length) continue
      line[x] = ch
    }
  })
  return grid
}

export function freezeFrame(grid: readonly string[][]): Matrix {
  return grid.map((row) => row.join(''))
}
