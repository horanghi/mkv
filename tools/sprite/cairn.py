from gen import blob, outline, shade, stamp, to_strings, show, mirror
import json, pathlib

# 실루엣은 읽히게 유지하고, 덩어리감은 내부 텍스처로 준다.
# 실루엣을 들쭉날쭉하게 만들면 외곽선이 조각나 노이즈로 읽힌다.

# ── 머리 무더기 (20x14) ──────────────────────────────────────────────
HEAD_W = [(6,-1), (11,-1), (15,-1), (17,0), (18,0), (18,0), (18,0), (18,0),
          (17,1), (16,1), (14,1), (12,0), (9,0), (5,0)]
head = shade(outline(blob(HEAD_W, 20)))
stamp(head, 3, 5, ['555.', '5005', '5555', '.66.'])
stamp(head, 11, 6, ['.555', '5005', '5555', '.66.'])

# ── 몸통 (34x22) ────────────────────────────────────────────────────
TORSO_W = [(12,0), (19,0), (25,-1), (29,-1), (32,0), (34,0), (34,0), (33,1),
           (33,0), (32,0), (31,0), (30,1), (29,0), (27,0), (26,1), (24,0),
           (22,0), (20,1), (17,0), (14,0), (10,0), (6,0)]
torso = shade(outline(blob(TORSO_W, 34)))
# 표면에 박힌 시체 — 갈비뼈, 팔뼈, 두개골 조각
stamp(torso, 5, 9,  ['.5556.', '50..06', '.5556.'])
stamp(torso, 24, 8, ['655.', '5..0', '.556'])
stamp(torso, 8, 15, ['.55.', '5006'])
stamp(torso, 19, 16, ['556', '.66'])
# 박힌 묘비 조각 — 각진 면이 유기적 덩어리와 대비된다
stamp(torso, 14, 4, ['0110', '0110'])
stamp(torso, 27, 13, ['011', '011'])

# ── 팔 (12x24) ──────────────────────────────────────────────────────
ARM_W = [(12,0), (12,0), (12,0), (11,0), (11,0), (10,0), (10,0), (10,0),
         (9,0), (9,0), (9,0), (10,0), (11,0), (12,0), (12,0), (12,0),
         (11,0), (9,0)]
arm = shade(outline(blob(ARM_W, 12, align='left')))
stamp(arm, 2, 14, ['.1..1.', '.1..1.'])     # 주먹 관절 능선

def darken(grid):
    """뒷팔은 어둡게. 측면 픽셀아트에서 앞뒤를 나누는 표준 기법이다.
    이것이 없으면 두 팔이 같은 평면에 붙은 장식으로 읽힌다. → docs/12 파츠 표"""
    m = {'1': '3', '2': '3', '3': '4', '4': '4'}
    return [[m.get(c, c) for c in row] for row in grid]

arm_back = darken(mirror(arm))

# ── 기단 (56x16) ────────────────────────────────────────────────────
# 무너진 묘지. 세로로 선 판이 아니라 **기울어 쓰러진 판**이라야 잔해로 읽힌다.
# 수직 막대를 늘어놓으면 막대그래프가 된다.
BASE_W = [(0,0), (0,0), (0,0), (0,0), (26,-6), (36,-3), (44,-1), (49,0),
          (52,0), (54,0), (55,0), (56,0), (56,0), (56,0), (56,0), (56,0)]
base = shade(outline(blob(BASE_W, 56)))

def tilted(w, h, dx):
    """가로로 누운 묘비. dx 만큼 행마다 밀려 기운 판이 된다."""
    rows = []
    for y in range(h):
        pad = (y * dx) // max(1, h - 1)
        face = '0' * w if y in (0, h - 1) else '0' + '1' * (w - 2) + '0'
        rows.append('.' * max(0, pad) + face)
    return rows

def chunk(w, h):
    return ['0' * w] + ['0' + '2' * (w - 2) + '0'] * (h - 2) + ['0' * w]

stamp(base, 2, 6, tilted(14, 5, 3))     # 왼쪽 — 앞으로 넘어진 판
stamp(base, 20, 3, tilted(11, 6, -4))   # 가운데 — 비스듬히 박힌 판
stamp(base, 38, 7, tilted(13, 4, 2))    # 오른쪽 — 낮게 깔린 판
stamp(base, 33, 2, chunk(5, 5))         # 부서진 조각
stamp(base, 15, 9, chunk(4, 4))

# ── 코어 (10x10) ────────────────────────────────────────────────────
CORE_W = [4, 6, 8, 10, 10, 10, 10, 8, 6, 4]
core = shade(outline(blob(CORE_W, 10, fill='8'), ch='9'),
             light='7', mid='8', dark='9', deep='9')

PARTS = {'HEAD': head, 'TORSO': torso, 'ARM': arm,
         'ARM_BACK': arm_back, 'BASE': base, 'CORE': core}
# 팔은 어깨가 몸통 안에 묻혀야 한다. 닿기만 하면 떨어져 보인다 (그림 날개와 같은 실패).
OFFSETS = {'BASE': (0, 36), 'TORSO': (11, 16), 'HEAD': (18, 5),
           'ARM_B': (2, 21), 'ARM_F': (42, 21), 'CORE': (23, 26)}
(pathlib.Path(__file__).resolve().parent / 'parts.json').write_text(json.dumps(
    {'parts': {k: to_strings(v) for k, v in PARTS.items()}, 'offsets': OFFSETS},
    ensure_ascii=False, indent=1))
for n, g in PARTS.items():
    show(n, to_strings(g))
