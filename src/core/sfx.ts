import { SFX_SPECS, type SfxLayer, type SfxName, type SfxSpec } from './sfxSpec.ts'

/**
 * SFX 드라이버 — WebAudio 합성.
 *
 * **음원 파일이 아직 없다.** docs/07 이 정한 143종을 만들기 전까지,
 * 게임이 무음이면 손맛을 평가할 수 없으므로 합성으로 대신한다.
 * 믹싱 로직(`core/audio.ts`)은 완성돼 있고, 여기만 파일 재생으로 바뀐다.
 *
 * 레이어 구성은 `sfxSpec.ts` 가 정한다 — 갑옷 파괴처럼 중요한 소리는
 * 여러 겹이 시차를 두고 쌓여야 한다. → docs/07-audio.md 7.5
 *
 * 계측 대상이 아니다 — WebAudio 는 node 에서 돌지 않는다. 명세는 순수 모듈에서 검증한다.
 */

export type { SfxName }

/** 노이즈 버퍼 길이 (초). 가장 긴 레이어보다 길어야 잘리지 않는다. */
const NOISE_SECONDS = 1

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  /** 브라우저는 사용자 조작 전에는 소리를 내지 않는다. 첫 입력에서 깨운다. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.6
    this.master.connect(this.ctx.destination)

    // 노이즈는 한 번만 굽는다. 매번 만들면 타격이 몰릴 때 끊긴다.
    const length = Math.floor(this.ctx.sampleRate * NOISE_SECONDS)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buffer
  }

  setVolume(value: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, value))
  }

  /**
   * BGM 이 같은 컨텍스트를 쓰도록 내준다.
   *
   * 컨텍스트를 둘 만들면 브라우저마다 하나만 깨어나거나, 둘 다 깨어도
   * 시계가 달라 스케줄이 어긋난다. 소리를 내는 곳은 하나여야 한다.
   */
  get context(): AudioContext | null {
    return this.ctx
  }

  play(name: SfxName): void {
    const spec: SfxSpec | undefined = SFX_SPECS[name]
    if (spec) this.playSpec(spec)
  }

  private playSpec(spec: SfxSpec): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || ctx.state !== 'running') return

    const now = ctx.currentTime
    for (const layer of spec.layers) {
      const repeats = Math.max(1, Math.trunc(layer.repeat ?? 1))
      for (let i = 0; i < repeats; i += 1) {
        const spread = i * (layer.repeatSpreadMs ?? 0)
        this.playLayer(ctx, master, layer, now + (layer.delayMs + spread) / 1000)
      }
    }
  }

  private playLayer(ctx: AudioContext, master: GainNode, layer: SfxLayer, at: number): void {
    const seconds = layer.ms / 1000
    const end = at + seconds

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(layer.gain, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)

    // 밴드패스가 노이즈를 금속·파편으로 만든다. 없으면 그냥 잡음이다.
    let tail: AudioNode = gain
    if (layer.filterHz !== undefined) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = layer.filterHz
      filter.Q.value = layer.q ?? 1
      gain.connect(filter)
      tail = filter
    }
    tail.connect(master)

    if (layer.source === 'noise') {
      const buffer = this.noiseBuffer
      if (!buffer) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      source.start(at)
      source.stop(end)
      return
    }

    const osc = ctx.createOscillator()
    osc.type = layer.source
    osc.frequency.setValueAtTime(layer.hz, at)
    if (layer.toHz !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, layer.toHz), end)
    }
    osc.connect(gain)
    osc.start(at)
    osc.stop(end)
  }
}
