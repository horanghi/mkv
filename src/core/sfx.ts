/**
 * SFX 드라이버 — WebAudio 합성.
 *
 * **음원 파일이 아직 없다.** docs/07 이 정한 40종을 만들기 전까지,
 * 게임이 무음이면 손맛을 평가할 수 없으므로 간단한 합성음으로 대신한다.
 * 믹싱 로직(`core/audio.ts`)은 완성돼 있고, 여기만 파일 재생으로 바뀐다.
 * → docs/07-audio.md 7.5
 */

export type SfxName =
  | 'jump' | 'land' | 'throw' | 'hit' | 'enemyDie'
  | 'armorBreak' | 'death' | 'relic' | 'bossHit' | 'quake'

interface SfxSpec {
  /** 시작 주파수 */
  readonly hz: number
  /** 끝 주파수. 없으면 고정. */
  readonly toHz?: number
  readonly ms: number
  readonly type: OscillatorType
  readonly gain: number
  /** 노이즈를 섞는다. 타격음에 쓴다. */
  readonly noise?: number
}

const SPECS: Readonly<Record<SfxName, SfxSpec>> = {
  jump: { hz: 320, toHz: 620, ms: 90, type: 'square', gain: 0.10 },
  land: { hz: 180, toHz: 90, ms: 70, type: 'triangle', gain: 0.08 },
  throw: { hz: 700, toHz: 380, ms: 70, type: 'sawtooth', gain: 0.07 },
  hit: { hz: 220, toHz: 120, ms: 90, type: 'square', gain: 0.12, noise: 0.5 },
  enemyDie: { hz: 260, toHz: 70, ms: 180, type: 'sawtooth', gain: 0.11, noise: 0.4 },
  armorBreak: { hz: 900, toHz: 110, ms: 380, type: 'sawtooth', gain: 0.18, noise: 0.7 },
  death: { hz: 420, toHz: 50, ms: 700, type: 'triangle', gain: 0.2, noise: 0.3 },
  relic: { hz: 520, toHz: 1040, ms: 320, type: 'sine', gain: 0.12 },
  bossHit: { hz: 150, toHz: 90, ms: 120, type: 'square', gain: 0.13, noise: 0.6 },
  quake: { hz: 90, toHz: 40, ms: 420, type: 'sine', gain: 0.22, noise: 0.5 },
}

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
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.6
    this.master.connect(this.ctx.destination)

    // 노이즈 한 번만 굽는다. 매번 만들면 타격이 몰릴 때 끊긴다.
    const length = this.ctx.sampleRate * 0.5
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buffer
  }

  setVolume(value: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, value))
  }

  play(name: SfxName): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || ctx.state !== 'running') return

    const spec = SPECS[name]
    const now = ctx.currentTime
    const seconds = spec.ms / 1000

    const osc = ctx.createOscillator()
    osc.type = spec.type
    osc.frequency.setValueAtTime(spec.hz, now)
    if (spec.toHz !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.toHz), now + seconds)
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(spec.gain, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)

    osc.connect(gain).connect(master)
    osc.start(now)
    osc.stop(now + seconds)

    if (spec.noise && this.noiseBuffer) {
      const source = ctx.createBufferSource()
      source.buffer = this.noiseBuffer
      const noiseGain = ctx.createGain()
      noiseGain.gain.setValueAtTime(spec.gain * spec.noise, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
      source.connect(noiseGain).connect(master)
      source.start(now)
      source.stop(now + seconds)
    }
  }
}
