import { Container, Graphics } from 'pixi.js'
import { LOGICAL_WIDTH } from '../core/config.ts'
import { WEAPON_MATRICES } from '../sprite/lancel.ts'
import { PAL_STEEL } from '../sprite/palette.ts'
import { formatScore, formatTime, isTimeCritical, type HudState } from '../ui/hud/hud.ts'

/**
 * HUD 그리기.
 *
 * **반투명을 쓰지 않는다.** 픽셀아트에서 반투명 UI 는 지저분해진다.
 * 자동 흐림도 알파가 아니라 색을 어둡게 해서 만든다.
 * → docs/09-ui-ux-controls.md 9.2
 */

/** HUD 상단 바 높이. 전경 나뭇가지가 이 아래에 걸린다 — 위에 그리면 가려진다. */
export const HUD_BAR_HEIGHT = 24
const BAR_HEIGHT = HUD_BAR_HEIGHT
/** 보스 게이지 두께. 상단바보다 얇아야 상시 정보와 구분된다. */
const BOSS_BAR_HEIGHT = 6
const COLOR = {
  bar: 0x0b0710,
  life: 0xc23b4a,
  lifeEmpty: 0x3a2530,
  text: 0xede6d8,
  warn: 0xe23e4e,
  bossBack: 0x241c2e,
  bossEdge: 0x0b0710,
  bossFill: 0xc23b4a,
} as const

/** 3×5 비트맵 숫자와 콜론. 폰트를 싣지 않으려고 직접 찍는다. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ':': ['000', '010', '000', '010', '000'],
  ',': ['000', '000', '000', '010', '100'],
}

export class HudRenderer {
  private readonly gfx = new Graphics()

  constructor(layer: Container) {
    layer.addChild(this.gfx)
  }

  draw(hud: HudState, timeMs: number): void {
    const g = this.gfx.clear()
    // 흐림은 알파가 아니라 밝기로 준다. 반투명은 픽셀아트를 지저분하게 만든다.
    const dim = hud.alpha

    g.rect(0, 0, LOGICAL_WIDTH, BAR_HEIGHT).fill(COLOR.bar)

    // 잔기 — 마름모
    for (let i = 0; i < 3; i += 1) {
      const filled = i < hud.lives
      drawDiamond(g, 8 + i * 10, 12, 4, shade(filled ? COLOR.life : COLOR.lifeEmpty, dim))
    }

    // 무기 아이콘
    const weapon = WEAPON_MATRICES[hud.weaponId]
    if (weapon) {
      weapon.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          const color = PAL_STEEL[row[x] ?? '.']
          if (!color) continue
          g.rect(44 + x, 8 + y, 1, 1).fill({ color, alpha: dim })
        }
      })
    }

    // 시간 — 30초 이하에서 붉게 맥동한다
    const critical = isTimeCritical(hud)
    const pulse = critical ? 0.6 + 0.4 * Math.abs(Math.sin(timeMs / 200)) : 1
    const timeText = formatTime(hud.secondsLeft)
    drawText(g, timeText, LOGICAL_WIDTH - 132, 9,
      shade(critical ? COLOR.warn : COLOR.text, dim * pulse))

    // 점수
    const score = formatScore(hud.score)
    drawText(g, score, LOGICAL_WIDTH - 8 - score.length * 4, 9, shade(COLOR.text, dim))

    // 보스 HP — 조건부, 상단바 바로 아래.
    //
    // 바닥에 깔면 보스와 플레이어가 있는 곳에서 눈을 떼야 읽힌다. 이 장르에서
    // 보스 게이지는 위에 있고, 위쪽은 이미 정보를 보러 가는 자리다(시간·점수).
    if (hud.bossHp !== null) {
      const width = 300
      const left = (LOGICAL_WIDTH - width) / 2
      const top = BAR_HEIGHT + 4
      g.rect(left - 1, top - 1, width + 2, BOSS_BAR_HEIGHT + 2).fill(COLOR.bossEdge)
      g.rect(left, top, width, BOSS_BAR_HEIGHT).fill(COLOR.bossBack)
      g.rect(left, top, Math.round(width * clamp01(hud.bossHp)), BOSS_BAR_HEIGHT)
        .fill(COLOR.bossFill)
    }

    // 성흔 쿨다운 — 성유물 착용 시에만, 우하단
    if (hud.sigilCooldown !== null) {
      const pips = 10
      const filled = Math.round(pips * (1 - clamp01(hud.sigilCooldown)))
      for (let i = 0; i < pips; i += 1) {
        g.rect(LOGICAL_WIDTH - 8 - (pips - i) * 5, 238, 3, 3)
          .fill(shade(i < filled ? 0xc9a6e8 : 0x3a2f48, dim))
      }
    }
  }
}

function drawText(g: Graphics, text: string, x: number, y: number, color: number): void {
  let cursor = x
  for (const ch of text) {
    const glyph = GLYPHS[ch]
    if (glyph) {
      glyph.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx += 1) {
          if (row[gx] === '1') g.rect(cursor + gx, y + gy, 1, 1).fill(color)
        }
      })
    }
    cursor += 4
  }
}

function drawDiamond(g: Graphics, cx: number, cy: number, r: number, color: number): void {
  for (let dy = -r; dy <= r; dy += 1) {
    const w = r - Math.abs(dy)
    g.rect(cx - w, cy + dy, w * 2 + 1, 1).fill(color)
  }
}

/** 알파 대신 밝기를 낮춘다. */
function shade(color: number, factor: number): number {
  const f = clamp01(factor)
  const r = Math.round(((color >> 16) & 0xff) * f)
  const gr = Math.round(((color >> 8) & 0xff) * f)
  const b = Math.round((color & 0xff) * f)
  return (r << 16) | (gr << 8) | b
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
