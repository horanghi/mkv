"""캐른 파츠 생성기.

실루엣은 행별 폭 프로파일에서 만들고(손으로 세지 않는다),
디테일만 좌표로 찍는다. 이전 도트 작업의 실패 원인이 전부
'행 길이 오차'와 '폭이 안 변해서 냉장고가 되는 것'이었다.
"""

TRANSPARENT = '.'

def mirror(grid):
    """좌우 반전. 앞팔을 그려 뒷팔로 쓴다."""
    return [row[::-1] for row in grid]


def blob(widths, total, fill='2', align='center'):
    """행별 (폭) 또는 (폭, 치우침) 으로 덩어리를 만든다.

    align='left' 는 왼쪽 면을 곧게 세운다. 팔처럼 한쪽이 몸통에 붙는 부위는
    중앙 정렬하면 안 된다 — 위아래가 굵고 가운데가 잘록한 모래시계가 되어
    몸에 붙은 팔이 아니라 옆에 놓인 기둥으로 읽힌다.

    치우침이 있어야 좌우 비대칭이 생긴다. 대칭이면 어떤 폭 변화를 줘도
    '알' 처럼 보이고, 시체가 뭉친 덩어리로 읽히지 않는다.
    """
    grid = []
    for item in widths:
        w, shift = item if isinstance(item, tuple) else (item, 0)
        w = max(0, min(w, total))
        if align == 'left':
            left = max(0, min(total - w, shift))
        elif align == 'right':
            left = max(0, min(total - w, total - w - shift))
        else:
            left = max(0, min(total - w, (total - w) // 2 + shift))
        row = [TRANSPARENT] * total
        for x in range(left, left + w):
            row[x] = fill
        grid.append(row)
    return grid

def outline(grid, ch='0'):
    """실루엣 바깥 경계만 아웃라인. 내부에는 넣지 않는다 (docs/12 도트 원칙 1)."""
    h, w = len(grid), len(grid[0])
    def solid(x, y):
        return 0 <= x < w and 0 <= y < h and grid[y][x] != TRANSPARENT
    out = [row[:] for row in grid]
    for y in range(h):
        for x in range(w):
            if not solid(x, y):
                continue
            if not (solid(x-1, y) and solid(x+1, y) and solid(x, y-1) and solid(x, y+1)):
                out[y][x] = ch
    return out

def shade(grid, light='1', mid='2', dark='3', deep='4'):
    """왼쪽 위에서 빛이 온다고 보고 면을 나눈다. 폭 변화가 실루엣을 살린다."""
    h, w = len(grid), len(grid[0])
    out = [row[:] for row in grid]
    for y in range(h):
        xs = [x for x in range(w) if grid[y][x] == mid]
        if not xs:
            continue
        lo, hi = min(xs), max(xs)
        span = hi - lo + 1
        for x in xs:
            rel = (x - lo) / max(1, span - 1)
            depth = y / max(1, h - 1)
            if rel < 0.18 and depth < 0.75:
                out[y][x] = light
            elif rel > 0.80 or depth > 0.82:
                out[y][x] = dark
            if rel > 0.90 and depth > 0.70:
                out[y][x] = deep
    return out

def stamp(grid, x0, y0, pattern):
    """디테일을 좌표에 찍는다. '.' 는 건너뛴다(투명 유지)."""
    for dy, row in enumerate(pattern):
        for dx, ch in enumerate(row):
            if ch == TRANSPARENT:
                continue
            y, x = y0 + dy, x0 + dx
            if 0 <= y < len(grid) and 0 <= x < len(grid[0]):
                grid[y][x] = ch
    return grid

def to_strings(grid):
    return [''.join(r) for r in grid]

def show(name, rows):
    print(f'--- {name} ({len(rows[0])}x{len(rows)}) ---')
    for r in rows:
        print('  ' + r.replace('.', ' '))
