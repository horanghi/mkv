import { Filter, GlProgram } from 'pixi.js'

/**
 * 화면 마감 — 색수차 · 비네트 · 그레인을 한 패스에서 처리한다.
 *
 * 셋 다 픽셀당 저비용 연산이라 패스를 나눌 이유가 없다.
 * 논리 해상도(480×270)에서 처리하고 마지막에만 업스케일한다 —
 * 1080p 에서 포스트 처리를 하면 픽셀당 비용이 16배가 된다.
 * → docs/06-visual-direction.md 6.4 · docs/10-tech-spec.md 10.5
 */

const VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`

const FRAGMENT = `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;

/** 픽셀 단위 RGB 분리량. 0 이면 색수차가 없다. */
uniform float uAberration;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 texel = uInputSize.zw;

  vec4 color;
  if (uAberration > 0.0) {
    // 화면 중심에서 바깥으로 갈수록 크게 어긋난다. 렌즈 수차의 성질이다.
    vec2 fromCenter = uv - vec2(0.5);
    vec2 shift = fromCenter * uAberration * texel * 2.0;
    color.r = texture(uTexture, uv + shift).r;
    color.g = texture(uTexture, uv).g;
    color.b = texture(uTexture, uv - shift).b;
    color.a = texture(uTexture, uv).a;
  } else {
    color = texture(uTexture, uv);
  }

  if (uVignette > 0.0) {
    vec2 d = (uv - vec2(0.5)) * 2.0;
    float edge = dot(d, d);
    color.rgb *= 1.0 - uVignette * edge * edge;
  }

  if (uGrain > 0.0) {
    // 시간에 따라 알갱이가 움직여야 필름처럼 보인다. 고정되면 얼룩이 된다.
    float n = rand(gl_FragCoord.xy + vec2(uTime, uTime * 1.7)) - 0.5;
    color.rgb += n * uGrain;
  }

  finalColor = color;
}
`

export interface ScreenFilterOptions {
  readonly vignette?: number
  readonly grain?: number
}

/**
 * 비네트 0.25, 그레인 0.03 이 기본값이다.
 *
 * 그레인은 거의 안 보이지만 없으면 화면이 죽는다. → docs/06 6.4
 */
export class ScreenFilter extends Filter {
  constructor(options: ScreenFilterOptions = {}) {
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'grimhollow-screen' }),
      resources: {
        screenUniforms: {
          uAberration: { value: 0, type: 'f32' },
          uVignette: { value: options.vignette ?? 0.25, type: 'f32' },
          uGrain: { value: options.grain ?? 0.03, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
        },
      },
    })
  }

  private get uniforms(): Record<string, number> {
    return (this.resources['screenUniforms'] as { uniforms: Record<string, number> }).uniforms
  }

  /** 픽셀 단위 분리량. `fx/aberration.ts` 의 pixelOffset 을 그대로 받는다. */
  set aberration(px: number) {
    this.uniforms['uAberration'] = px
  }

  set vignette(value: number) {
    this.uniforms['uVignette'] = value
  }

  set grain(value: number) {
    this.uniforms['uGrain'] = value
  }

  set time(seconds: number) {
    this.uniforms['uTime'] = seconds
  }
}
