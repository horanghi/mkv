import { createRng, type RngState } from '../core/rng.ts'
import { NO_SHAKE, shakeOffset, startShake, stepShake, strongest, type Shake } from '../fx/camera.ts'
import {
  ARMOR_BREAK,
  ARMOR_BREAK_TIMING,
  DEATH,
  DEATH_TIMING,
  IDLE_SEQUENCE,
  advanceSequence,
  progressAt,
  startSequence,
  type SequenceState,
} from '../fx/sequence.ts'
import { armorPixels, pruneShards, spawnShards, stepShards, type Shard } from '../fx/shard.ts'
import type { ArmorState } from '../sprite/armor.ts'
import { paletteFor } from '../sprite/armor.ts'
import type { Matrix } from '../sprite/matrix.ts'

/**
 * 갑옷 파괴·사망 연출의 진행 담당.
 *
 * 타이밍(`fx/sequence.ts`)과 그리기(`breakFx.ts`) 사이에서 상태를 들고 있는다.
 * **연출은 히트스톱 중에도 흐른다** — 로직이 멈춘 동안 화면에서 벌어지는 일이
 * 곧 이 연출이기 때문이다. 그래서 로직 틱이 아니라 실제 프레임 시간으로 굴린다.
 * → docs/06-visual-direction.md 6.3
 */

export interface BreakStart {
  /** 깨진 갑옷의 실제 프레임. 파편은 이 픽셀에서 나온다. */
  readonly matrix: Matrix
  readonly armor: ArmorState
  /** 스프라이트 좌상단의 월드 좌표 */
  readonly origin: { readonly x: number; readonly y: number }
}

export class BreakDirector {
  private breakSeq: SequenceState = IDLE_SEQUENCE
  private deathSeq: SequenceState = IDLE_SEQUENCE
  private shake: Shake = NO_SHAKE
  private rng: RngState
  private pending: BreakStart | null = null
  private origin = { x: 0, y: 0 }
  private invertFrames = 0

  shards: readonly Shard[] = []

  constructor(seed: number) {
    this.rng = createRng(seed)
  }

  /** 갑옷 파괴 시작. 파편은 40ms 뒤에 나온다. */
  breakArmor(start: BreakStart): void {
    this.pending = start
    this.origin = start.origin
    this.breakSeq = startSequence()
  }

  /** 사망 시작. */
  die(origin: { readonly x: number; readonly y: number }): void {
    this.origin = { ...origin }
    this.deathSeq = startSequence()
  }

  reset(): void {
    this.breakSeq = IDLE_SEQUENCE
    this.deathSeq = IDLE_SEQUENCE
    this.shake = NO_SHAKE
    this.shards = []
    this.pending = null
    this.invertFrames = 0
  }

  /** 실제 프레임 시간으로 진행한다. 히트스톱과 무관하다. */
  advance(frameMs: number): void {
    if (!this.breakSeq.done) {
      const step = advanceSequence(ARMOR_BREAK, this.breakSeq, frameMs)
      this.breakSeq = step.state
      for (const event of step.fired) {
        if (event === 'shards') this.spawn()
        if (event === 'invert') this.invertFrames = 1
        if (event === 'shake') this.addShake(ARMOR_BREAK_TIMING.shake)
      }
    }

    if (!this.deathSeq.done) {
      const step = advanceSequence(DEATH, this.deathSeq, frameMs)
      this.deathSeq = step.state
      for (const event of step.fired) {
        if (event === 'shatter') this.addShake(DEATH_TIMING.shake)
      }
    }

    this.shake = stepShake(this.shake, frameMs)
  }

  /** 파편 물리. **로직 틱에서 부른다** — 히트스톱 중에는 멈춰야 한다. */
  stepShards(gravity: number, groundY: number, dt: number): void {
    this.shards = pruneShards(
      stepShards(this.shards, { gravity, restitution: 0.36, groundY }, dt),
      ARMOR_BREAK_TIMING.shardHoldMs,
    )
  }

  get cameraOffset(): { readonly x: number; readonly y: number } {
    return shakeOffset(this.shake)
  }

  /** 백색 플래시 알파. 40ms 동안만 살아 있다. */
  get flashAlpha(): number {
    if (this.breakSeq.done || this.breakSeq.elapsedMs > ARMOR_BREAK_TIMING.flashMs) return 0
    return 1 - progressAt(this.breakSeq, 0, ARMOR_BREAK_TIMING.flashMs) * 0.4
  }

  /** 방사형 링 — 반경과 알파. */
  get ring(): { readonly x: number; readonly y: number; readonly radius: number; readonly alpha: number } {
    const t = progressAt(this.breakSeq, ARMOR_BREAK_TIMING.flashMs, ARMOR_BREAK_TIMING.ringMs)
    const { from, to } = ARMOR_BREAK_TIMING.ringRadius
    const visible = !this.breakSeq.done && t > 0 && t < 1
    return {
      x: this.origin.x + 16,
      y: this.origin.y + 16,
      radius: from + (to - from) * t,
      alpha: visible ? 1 - t : 0,
    }
  }

  /** 화면 반전 1프레임. 부를 때마다 소진된다. */
  consumeInvert(): boolean {
    if (this.invertFrames <= 0) return false
    this.invertFrames -= 1
    return true
  }

  /** 백골화 진행 프레임. 사망 중이 아니면 null. */
  get skeletonFrame(): number | null {
    if (this.deathSeq.done) return null
    const t = progressAt(this.deathSeq, 0, DEATH_TIMING.skeletonizeMs)
    return Math.min(DEATH_TIMING.skeletonizeFrames - 1, Math.floor(t * DEATH_TIMING.skeletonizeFrames))
  }

  private spawn(): void {
    if (!this.pending) return
    const result = spawnShards({
      pixels: armorPixels(this.pending.matrix, paletteFor(this.pending.armor)),
      count: ARMOR_BREAK_TIMING.shardCount,
      origin: this.pending.origin,
      impact: { x: 16, y: 14 },
      rng: this.rng,
    })
    this.rng = result.rng
    this.shards = [...this.shards, ...result.shards]
    this.pending = null
  }

  private addShake(spec: { amplitude: number; durationMs: number; frequencyHz: number }): void {
    this.shake = strongest(this.shake, startShake(spec.amplitude, spec.durationMs, spec.frequencyHz))
  }
}
