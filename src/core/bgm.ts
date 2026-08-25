import { STEMS, gainsOf, type MusicState, type Stem } from './audio.ts'
import { notesAt, stepSeconds, type Note, type Theme } from './bgmPattern.ts'

/**
 * BGM 합성 드라이버.
 *
 * 음원 파일 대신 WebAudio 로 낸다. 패턴은 `bgmPattern.ts` 가 정하고
 * 여기서는 스케줄과 음색만 맡는다. 스템 5개는 각자 게인 노드를 갖고,
 * `core/audio.ts` 가 계산한 믹스가 그 게인이 된다 — 곡이 바뀌는 게 아니라
 * **층이 붙고 빠진다.** → docs/07-audio.md 7.2
 *
 * 계측 대상이 아니다 — WebAudio 는 node 에서 돌지 않는다. 패턴은 순수 모듈에서 검증한다.
 */

/** 얼마나 앞서 예약할 것인가. 짧으면 끊기고, 길면 믹스 변화가 늦게 반영된다. */
const LOOKAHEAD_SECONDS = 0.25

/** 스템별 음색. 낮은 현 · 첼레스타 · 종 — docs/07 7.3 의 S1 편성이다. */
interface Voice {
  readonly type: OscillatorType
  /** 어택 (초) */
  readonly attack: number
  /** 음 길이에 곱하는 배율. 1 보다 크면 다음 음까지 여운이 남는다 */
  readonly hold: number
  /** 릴리스 (초) */
  readonly release: number
  readonly gain: number
  /** 한 옥타브 위에 겹치는 배음의 세기. 0 이면 없다 */
  readonly shimmer: number
}

const VOICES: Readonly<Record<Stem, Voice>> = {
  // 낮은 현 — 천천히 부풀고 길게 끈다
  bass: { type: 'sawtooth', attack: 0.06, hold: 1, release: 0.5, gain: 0.16, shimmer: 0 },
  // 왈츠의 2·3박. 짧고 건조해야 회전이 생긴다
  rhythm: { type: 'triangle', attack: 0.005, hold: 0.7, release: 0.18, gain: 0.075, shimmer: 0 },
  // 첼레스타 — 배음을 얹어 종처럼
  melody: { type: 'triangle', attack: 0.004, hold: 1.1, release: 0.55, gain: 0.1, shimmer: 0.32 },
  // 성가 — 아주 느리게 들어오고 나간다
  chorus: { type: 'sine', attack: 0.45, hold: 1, release: 0.7, gain: 0.085, shimmer: 0.4 },
  // 종소리
  percussion: { type: 'sine', attack: 0.002, hold: 2.4, release: 1.6, gain: 0.2, shimmer: 0.5 },
}

/** 저역 통과 필터의 기본값. 필터가 꺼진 상태를 뜻한다. */
const OPEN_HZ = 20000

export class Bgm {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private lowpass: BiquadFilterNode | null = null
  private readonly stems = new Map<Stem, GainNode>()
  private step = 0
  private nextNoteAt = 0

  /** SFX 가 만든 컨텍스트를 받아 붙는다. 두 번 불러도 안전하다. */
  attach(ctx: AudioContext | null): void {
    if (this.ctx !== null || ctx === null) return

    this.ctx = ctx
    this.lowpass = ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = OPEN_HZ

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.lowpass.connect(this.master).connect(ctx.destination)

    for (const stem of STEMS) {
      const gain = ctx.createGain()
      gain.gain.value = 0
      gain.connect(this.lowpass)
      this.stems.set(stem, gain)
    }
    this.nextNoteAt = ctx.currentTime + 0.1
  }

  /** 매 프레임. 믹스를 반영하고 앞당겨 예약한다. */
  update(state: MusicState): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master || ctx.state !== 'running') return

    const gains = gainsOf(state)
    // 게인은 즉시 바꾸지 않는다. 계단처럼 튀면 딸깍 소리가 난다.
    for (const stem of STEMS) {
      const node = this.stems.get(stem)
      if (node) node.gain.setTargetAtTime(gains[stem], ctx.currentTime, 0.08)
    }
    master.gain.setTargetAtTime(state.silenceMs > 0 ? 0 : 1, ctx.currentTime, 0.05)
    if (this.lowpass) {
      this.lowpass.frequency.setTargetAtTime(state.lowpassHz ?? OPEN_HZ, ctx.currentTime, 0.12)
    }

    this.schedule(ctx, state.tempo, state.theme)
  }

  /** 컨텍스트가 죽었을 때 다시 붙을 수 있도록 비운다. */
  detach(): void {
    this.ctx = null
    this.master = null
    this.lowpass = null
    this.stems.clear()
  }

  private schedule(ctx: AudioContext, tempo: number, theme: Theme): void {
    const spanSeconds = stepSeconds(tempo)
    const horizon = ctx.currentTime + LOOKAHEAD_SECONDS

    // 탭을 접었다 오면 시계가 멀리 가 있다. 밀린 것을 다 내지 않고 따라잡는다.
    if (this.nextNoteAt < ctx.currentTime - 1) this.nextNoteAt = ctx.currentTime

    let guard = 0
    while (this.nextNoteAt < horizon && guard < 64) {
      for (const stem of STEMS) {
        const node = this.stems.get(stem)
        if (!node) continue
        for (const note of notesAt(stem, this.step, theme)) {
          this.playNote(ctx, node, VOICES[stem], note, this.nextNoteAt, spanSeconds)
        }
      }
      this.step += 1
      this.nextNoteAt += spanSeconds
      guard += 1
    }
  }

  private playNote(
    ctx: AudioContext,
    destination: GainNode,
    voice: Voice,
    note: Note,
    at: number,
    spanSeconds: number,
  ): void {
    const duration = note.steps * spanSeconds * voice.hold
    const end = at + duration + voice.release

    const gain = ctx.createGain()
    const peak = voice.gain * note.gain
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + voice.attack)
    gain.gain.setValueAtTime(peak, at + duration)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.connect(destination)

    const osc = ctx.createOscillator()
    osc.type = voice.type
    osc.frequency.setValueAtTime(note.hz, at)
    osc.connect(gain)
    osc.start(at)
    osc.stop(end)

    if (voice.shimmer > 0) {
      const upper = ctx.createOscillator()
      upper.type = 'sine'
      upper.frequency.setValueAtTime(note.hz * 2, at)
      const upperGain = ctx.createGain()
      upperGain.gain.setValueAtTime(0.0001, at)
      upperGain.gain.exponentialRampToValueAtTime(peak * voice.shimmer, at + voice.attack)
      upperGain.gain.exponentialRampToValueAtTime(0.0001, end)
      upper.connect(upperGain).connect(destination)
      upper.start(at)
      upper.stop(end)
    }
  }
}
