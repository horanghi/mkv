/**
 * 2D 동적 광원.
 *
 * 픽셀아트에 동적 광원은 비용 대비 화려함이 가장 큰 기법이다.
 * 그림자 캐스팅은 넣지 않는다 — 2D 에서는 비용 대비 효과가 낮다.
 * → docs/06-visual-direction.md 6.4
 */

export interface Flicker {
  /** 강도 흔들림 폭 [0,1] */
  readonly amplitude: number
  readonly hz: number
  /** 광원마다 위상을 달리해 전부 같이 깜빡이지 않게 한다. 없으면 0 이다. */
  readonly phase?: number
}

export interface Light {
  readonly x: number
  readonly y: number
  readonly radius: number
  /** 0xRRGGBB */
  readonly color: number
  readonly intensity: number
  readonly flicker?: Flicker
}

/** 성유물 갑옷은 스스로 빛난다. 갑옷을 잃으면 세상이 어두워진다. */
export const RELIC_LIGHT = {
  gold: { radius: 72, color: 0xfff6d0, intensity: 0.9 },
  silver: { radius: 64, color: 0xdfe9ff, intensity: 0.8 },
  crystal: { radius: 60, color: 0xd9b6ff, intensity: 0.85 },
} as const

export const TORCH_LIGHT = {
  radius: 48,
  color: 0xffb454,
  intensity: 0.8,
  flicker: { amplitude: 0.22, hz: 9, phase: 0 },
} as const

/** 깜빡임을 반영한 지금 강도. */
export function intensityAt(light: Light, timeMs: number): number {
  if (!light.flicker) return light.intensity
  const { amplitude, hz, phase = 0 } = light.flicker
  // 사인 둘을 겹쳐 규칙적인 맥동으로 보이지 않게 한다.
  const t = (timeMs / 1000) * hz * Math.PI * 2 + phase
  const wobble = Math.sin(t) * 0.6 + Math.sin(t * 1.7) * 0.4
  return Math.max(0, light.intensity * (1 + wobble * amplitude))
}

/**
 * 한 점에서 받는 빛의 양 [0,1].
 *
 * 감쇠는 제곱이 아니라 부드러운 곡선을 쓴다. 물리적 정확도보다
 * 반경 안이 고르게 밝은 것이 픽셀아트에서 읽기 좋다.
 */
export function contributionAt(light: Light, x: number, y: number, timeMs: number): number {
  const distance = Math.hypot(x - light.x, y - light.y)
  if (distance >= light.radius) return 0
  const falloff = 1 - distance / light.radius
  return intensityAt(light, timeMs) * falloff * falloff
}

/**
 * 광원 수를 상한에 맞춘다.
 *
 * 화면 밖이나 먼 광원부터 버린다. 가까운 것이 화면에 미치는 영향이 크다.
 */
export function limitLights(
  lights: readonly Light[],
  max: number,
  focus: { readonly x: number; readonly y: number },
): readonly Light[] {
  if (max <= 0) return []
  if (lights.length <= max) return lights

  return [...lights]
    .map((light) => ({ light, d: Math.hypot(light.x - focus.x, light.y - focus.y) - light.radius }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((entry) => entry.light)
}

/** 셰이더에 넘길 평평한 배열. [x, y, radius, intensity] × N */
export function packLights(lights: readonly Light[], timeMs: number): Float32Array {
  const data = new Float32Array(lights.length * 4)
  lights.forEach((light, i) => {
    data[i * 4] = light.x
    data[i * 4 + 1] = light.y
    data[i * 4 + 2] = light.radius
    data[i * 4 + 3] = intensityAt(light, timeMs)
  })
  return data
}

/** 색도 함께. [r, g, b] × N, 0~1 */
export function packColors(lights: readonly Light[]): Float32Array {
  const data = new Float32Array(lights.length * 3)
  lights.forEach((light, i) => {
    data[i * 3] = ((light.color >> 16) & 0xff) / 255
    data[i * 3 + 1] = ((light.color >> 8) & 0xff) / 255
    data[i * 3 + 2] = (light.color & 0xff) / 255
  })
  return data
}
