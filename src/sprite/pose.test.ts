import { describe, expect, it } from 'vitest'
import { partsFor } from './armor.ts'
import { CLIPS } from './clip.ts'
import { PARTS_ARMORED, PARTS_BARE, PARTS_BONE } from './lancel.ts'
import { SPRITE_SIZE } from './matrix.ts'
import { ANCHORS, detachedLimbs, pose } from './pose.ts'

const armored = partsFor('steel')

/** 프레임에서 특정 색 인덱스가 쓰인 좌표. */
function cellsOf(frame: readonly string[], chars: string): [number, number][] {
  const out: [number, number][] = []
  frame.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (chars.includes(ch)) out.push([x, y])
    }),
  )
  return out
}

function isBlank(frame: readonly string[]): boolean {
  return frame.every((row) => [...row].every((ch) => ch === '.'))
}

describe('조립', () => {
  it('언제나 32×32 를 낸다', () => {
    const frame = pose(armored)
    expect(frame).toHaveLength(SPRITE_SIZE)
    expect(frame.every((r) => r.length === SPRITE_SIZE)).toBe(true)
  })

  it('빈 프레임이 아니다', () => {
    expect(isBlank(pose(armored))).toBe(false)
  })

  it('오프셋이 없으면 파츠가 기준 위치에 온다', () => {
    const frame = pose(armored)
    // 투구 깃털은 (4,2) 에서 시작한다 — 인덱스 7,8 은 깃털 전용 색이다.
    const plume = cellsOf(frame, '78')
    expect(Math.min(...plume.map((c) => c[1]))).toBe(ANCHORS.PLUME[1])
  })

  it('dy 는 전신을 내린다', () => {
    const base = cellsOf(pose(armored), '78')
    const moved = cellsOf(pose(armored, { dy: 3 }), '78')
    expect(Math.min(...moved.map((c) => c[1]))).toBe(Math.min(...base.map((c) => c[1])) + 3)
  })

  it('lean 은 상체만 옮기고 다리는 두고 간다', () => {
    const leaned = pose(armored, { lean: -3 })
    const plume = cellsOf(leaned, '78')
    expect(Math.min(...plume.map((c) => c[0]))).toBe(ANCHORS.PLUME[0] - 3)

    // 부츠는 그대로다 — 상체만 젖히는 것이 lean 의 정의다.
    const bootRow = leaned[ANCHORS.BOOT_F[1]] ?? ''
    const plain = pose(armored)[ANCHORS.BOOT_F[1]] ?? ''
    expect(bootRow).toBe(plain)
  })

  it('격자 밖으로 밀어도 터지지 않는다', () => {
    expect(() => pose(armored, { dy: 40, lean: -40, af: 60 })).not.toThrow()
  })
})

describe('그리는 순서 — 뒤에서 앞으로', () => {
  it('앞팔이 몸통 위에 온다', () => {
    // ARM_F 를 몸통 한가운데로 밀면 앞팔 색이 몸통을 덮어야 한다.
    const frame = pose(armored, { af: -5 })
    const row = frame[ANCHORS.ARM_F[1] + 1] ?? ''
    // 앞팔 왼쪽 끝은 그림자색 4 다. 몸통 안쪽(x12)에서 보여야 한다.
    expect(row[ANCHORS.ARM_F[0] - 5]).toBe('4')
  })

  it('뒷팔은 몸통 뒤로 들어간다', () => {
    // 뒷팔을 몸통 범위 안에서 어디로 옮기든 몸통이 덮으므로 그 구간은 변하지 않는다.
    // 이것이 그리는 순서(ARM_B 가 TORSO 보다 먼저)의 직접 증명이다.
    const torsoSpan = (ab: number) =>
      (pose(armored, { ab })[ANCHORS.ARM_B[1] + 1] ?? '').slice(10, 20)

    const reference = torsoSpan(0)
    for (const ab of [-1, 1, 2, 3, 4]) {
      expect(torsoSpan(ab)).toBe(reference)
    }
  })
})

describe('교체 축 — 파츠셋', () => {
  it('세 파츠셋이 같은 포즈로 조립된다', () => {
    for (const parts of [PARTS_ARMORED, PARTS_BARE, PARTS_BONE]) {
      const frame = pose(parts, CLIPS.walk.keys[0])
      expect(frame).toHaveLength(SPRITE_SIZE)
      expect(isBlank(frame)).toBe(false)
    }
  })

  it('속옷과 백골에는 투구 깃털이 없다', () => {
    expect(cellsOf(pose(PARTS_BARE), '78')).toHaveLength(0)
    expect(cellsOf(pose(PARTS_BONE), '78')).toHaveLength(0)
    expect(cellsOf(pose(PARTS_ARMORED), '78').length).toBeGreaterThan(0)
  })

  it('실루엣 위치가 상태끼리 어긋나지 않는다', () => {
    // 같은 클립을 쓰려면 발끝이 같은 줄에 있어야 한다.
    const bottom = (parts: typeof PARTS_ARMORED) => {
      const frame = pose(parts)
      for (let y = frame.length - 1; y >= 0; y -= 1) {
        if ((frame[y] ?? '').includes('0') || /[^.]/.test(frame[y] ?? '')) return y
      }
      return -1
    }
    expect(bottom(PARTS_BARE)).toBe(bottom(PARTS_ARMORED))
    expect(bottom(PARTS_BONE)).toBe(bottom(PARTS_ARMORED))
  })
})

describe('무기', () => {
  it('attack 클립에서만 나타난다', () => {
    const idle = pose(armored, CLIPS.idle.keys[0], 'lance')
    const attack = pose(armored, CLIPS.attack.keys[1], 'lance')
    // 창 끝은 x20 부근에 있다. 대기 포즈에는 그 자리에 아무것도 없다.
    expect(attack).not.toEqual(idle)
  })

  it('무기 id 가 없으면 그리지 않는다', () => {
    const withWeapon = pose(armored, CLIPS.attack.keys[1], 'lance')
    const without = pose(armored, CLIPS.attack.keys[1])
    expect(withWeapon).not.toEqual(without)
  })

  it('모르는 무기는 조용히 건너뛴다', () => {
    const unknown = pose(armored, CLIPS.attack.keys[1], 'chainsaw')
    const without = pose(armored, CLIPS.attack.keys[1])
    expect(unknown).toEqual(without)
  })
})

describe('파츠 접합 검사', () => {
  it('모든 클립의 모든 프레임이 붙어 있다', () => {
    // 그림 날개 · 캐른 팔 · 착지 뒷팔로 세 번 반복한 실패다. 이제 테스트가 막는다.
    const problems: string[] = []
    for (const [name, clip] of Object.entries(CLIPS)) {
      clip.keys.forEach((key, i) => {
        const detached = detachedLimbs(key)
        if (detached.length > 0) problems.push(`${name} f${i}: ${detached.join(',')}`)
      })
    }
    expect(problems).toEqual([])
  })

  it('범위를 벗어난 오프셋을 잡아낸다', () => {
    expect(detachedLimbs({ ab: -2 })).toContain('ab')
    expect(detachedLimbs({ ab: -1 })).toEqual([])
    expect(detachedLimbs({ af: 3 })).toContain('af')
    expect(detachedLimbs({ af: 2 })).toEqual([])
  })
})
