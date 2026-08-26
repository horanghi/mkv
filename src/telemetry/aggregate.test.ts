import { describe, expect, it } from 'vitest'
import {
  GATE_DIFFICULTY, MIN_TESTERS, aggregate, gateVerdict, overall, type Aggregate,
} from './aggregate.ts'
import type { Payload } from './payload.ts'

function tester(patch: Partial<Payload> & { id: string }): Payload {
  return {
    v: 4, diff: GATE_DIFFICULTY, build: 'aaaaaaaa', playMin: 10, deaths: 10, retryRate: 1, attempts: 11, cleared: true,
    bossReached: true, hurts: 20, armorBreaks: 6,
    fps: { held: 1, p95: 17, avg: 60, samples: 20000, worst: 30 },
    loadKB: 620, worstRespawnMs: 1750,
    causes: { ghoul: 5, pit: 5 }, hotspots: [[32, 5], [80, 5]],
    survey: { deathFxLiked: true, jumpStiff: false, note: '' },
    ...patch,
  }
}

/** 합격선을 넘는 테스터 다섯 명. */
function passingFive(): Payload[] {
  return Array.from({ length: 5 }, (_, i) => tester({ id: `t${i}` }))
}

describe('테스터 결과 합산', () => {
  it('같은 id 는 하나만 센다 — 두 번 붙여넣으면 무게가 두 배가 된다', () => {
    const agg = aggregate([tester({ id: 'a' }), tester({ id: 'a', playMin: 20 }), tester({ id: 'b' })])
    expect(agg.testers).toBe(2)
    expect(agg.duplicatesDropped).toBe(1)
  })

  it('중복이면 더 많이 플레이한 쪽을 남긴다', () => {
    const agg = aggregate([
      tester({ id: 'a', playMin: 20, deaths: 30 }),
      tester({ id: 'a', playMin: 5, deaths: 3 }),
    ])
    expect(agg.totalDeaths).toBe(30)
  })

  it('식별자가 없어도 각각 센다', () => {
    expect(aggregate([tester({ id: '' }), tester({ id: '' })]).testers).toBe(2)
  })

  it('재시도율은 사망 수로 가중한다 — 단순 평균이 아니다', () => {
    const agg = aggregate([
      tester({ id: 'a', deaths: 2, retryRate: 1 }),      // 2회 전부 재시도
      tester({ id: 'b', deaths: 30, retryRate: 0.5 }),   // 30회 중 절반
    ])
    // 단순 평균이면 0.75, 가중이면 (2 + 15) / 32 = 0.53
    expect(agg.retryRate).toBeCloseTo(17 / 32, 4)
    expect(agg.retryRate).not.toBeCloseTo(0.75, 2)
  })

  it('유지율은 프레임 수로 가중한다 — 30초와 10분이 같을 수 없다', () => {
    const agg = aggregate([
      tester({ id: 'a', fps: { held: 1, p95: 17, avg: 60, samples: 1000, worst: 20 } }),
      tester({ id: 'b', fps: { held: 0.5, p95: 40, avg: 40, samples: 99000, worst: 90 } }),
    ])
    expect(agg.heldRate!).toBeLessThan(0.55)
  })

  it('시도 횟수는 클리어한 사람만 평균낸다', () => {
    const agg = aggregate([
      tester({ id: 'a', attempts: 10, cleared: true }),
      tester({ id: 'b', attempts: null, cleared: false }),
    ])
    expect(agg.meanAttempts).toBe(10)
    expect(agg.cleared).toBe(1)
  })

  it('연출 응답은 사람 수로 센다 — 사망 수와 무관하다', () => {
    const agg = aggregate([
      tester({ id: 'a', deaths: 100, survey: { deathFxLiked: false, jumpStiff: null, note: '' } }),
      tester({ id: 'b', deaths: 1, survey: { deathFxLiked: true, jumpStiff: null, note: '' } }),
      tester({ id: 'c', survey: { deathFxLiked: null, jumpStiff: null, note: '' } }),
    ])
    expect(agg.deathFxLiked).toBe(0.5)
    expect(agg.deathFxAnswered).toBe(2)
  })

  it('로드와 복귀 시간은 최악값을 본다 — 한 사람이라도 넘으면 넘은 것이다', () => {
    const agg = aggregate([
      tester({ id: 'a', loadKB: 600, worstRespawnMs: 1700 }),
      tester({ id: 'b', loadKB: 9000, worstRespawnMs: 4000 }),
    ])
    expect(agg.worstLoadKB).toBe(9000)
    expect(agg.worstRespawnMs).toBe(4000)
  })

  it('사망 구간과 사인을 겹쳐 본다 — 판독 불가 구간이 드러난다', () => {
    const agg = aggregate([
      tester({ id: 'a', hotspots: [[80, 5]], causes: { pit: 5 } }),
      tester({ id: 'b', hotspots: [[80, 7], [8, 1]], causes: { pit: 7, grimm: 2 } }),
    ])
    expect(agg.hotspots[0]).toEqual([80, 12])
    expect(agg.causes).toEqual({ pit: 12, grimm: 2 })
  })

  it('빈 입력도 견딘다', () => {
    const agg = aggregate([])
    expect(agg.testers).toBe(0)
    expect(agg.retryRate).toBeNull()
    expect(agg.heldRate).toBeNull()
    expect(agg.meanAttempts).toBeNull()
  })
})

describe('게이트 판정', () => {
  function verdictOf(agg: Aggregate, key: string): string {
    return gateVerdict(agg).find((l) => l.key === key)!.verdict
  }

  it('인원이 모자라면 판정하지 않는다 — 표본 부족을 통과로 읽으면 안 된다', () => {
    const few = aggregate(passingFive().slice(0, MIN_TESTERS - 1))
    expect(verdictOf(few, 'retryRate')).toBe('unknown')
    expect(verdictOf(few, 'fps')).toBe('unknown')
    expect(overall(gateVerdict(few))).toBe('unknown')
  })

  it('다섯 명이 전부 넘기면 통과한다', () => {
    expect(overall(gateVerdict(aggregate(passingFive())))).toBe('pass')
  })

  it('재시도율이 모자라면 실패다', () => {
    const weak = passingFive().map((p) => ({ ...p, retryRate: 0.8 }))
    expect(verdictOf(aggregate(weak), 'retryRate')).toBe('fail')
    expect(overall(gateVerdict(aggregate(weak)))).toBe('fail')
  })

  it('시도 횟수가 범위 밖이면 실패다 — 너무 쉬워도 실패다', () => {
    const easy = passingFive().map((p) => ({ ...p, attempts: 3 }))
    expect(verdictOf(aggregate(easy), 'attempts')).toBe('fail')

    const brutal = passingFive().map((p) => ({ ...p, attempts: 40 }))
    expect(verdictOf(aggregate(brutal), 'attempts')).toBe('fail')
  })

  it('아무도 못 깨면 시도 횟수를 판정하지 않는다', () => {
    const none = passingFive().map((p) => ({ ...p, cleared: false, attempts: null }))
    expect(verdictOf(aggregate(none), 'attempts')).toBe('unknown')
  })

  it('연출 반응 70% 를 가른다', () => {
    const three = passingFive().map((p, i) => ({
      ...p, survey: { ...p.survey, deathFxLiked: i < 3 },
    }))
    expect(verdictOf(aggregate(three), 'deathFx')).toBe('fail')   // 60%

    const four = passingFive().map((p, i) => ({
      ...p, survey: { ...p.survey, deathFxLiked: i < 4 },
    }))
    expect(verdictOf(aggregate(four), 'deathFx')).toBe('pass')    // 80%
  })

  it('한 사람이라도 예산을 넘으면 실패다', () => {
    const heavy = passingFive()
    heavy[0] = { ...heavy[0]!, loadKB: 9000 }
    expect(verdictOf(aggregate(heavy), 'load')).toBe('fail')

    const slow = passingFive()
    slow[0] = { ...slow[0]!, worstRespawnMs: 4000 }
    expect(verdictOf(aggregate(slow), 'controlBack')).toBe('fail')
  })

  it('60fps 를 못 지키면 실패다', () => {
    const choppy = passingFive().map((p) => ({ ...p, fps: { ...p.fps, held: 0.9 } }))
    expect(verdictOf(aggregate(choppy), 'fps')).toBe('fail')
  })

  it('부활이 3초를 넘으면 실패다', () => {
    const slow = passingFive().map((p) => ({ ...p, worstRespawnMs: 3200 }))
    expect(verdictOf(aggregate(slow), 'controlBack')).toBe('fail')
  })

  it('연출 반응이 모자라면 실패다', () => {
    const disliked = passingFive().map((p, i) => ({
      ...p, survey: { ...p.survey, deathFxLiked: i === 0 },
    }))
    expect(verdictOf(aggregate(disliked), 'deathFx')).toBe('fail')
  })

  it('재지 못한 항목은 판정하지 않는다 — 0 을 통과로 읽으면 안 된다', () => {
    const blank = passingFive().map((p) => ({
      ...p,
      retryRate: null,
      fps: { ...p.fps, held: null, samples: 0 },
      loadKB: null,
      worstRespawnMs: 0,
      survey: { ...p.survey, deathFxLiked: null },
    }))
    const agg = aggregate(blank)
    for (const key of ['retryRate', 'fps', 'load', 'controlBack', 'deathFx']) {
      expect(verdictOf(agg, key)).toBe('unknown')
    }
  })

  it('사망 표본이 적으면 재시도율을 판정하지 않는다', () => {
    const shy = passingFive().map((p) => ({ ...p, deaths: 1 }))
    expect(verdictOf(aggregate(shy), 'retryRate')).toBe('unknown')
  })

  it('하나라도 실패하면 전체가 실패다', () => {
    const mixed = passingFive().map((p) => ({ ...p, retryRate: 0.5 }))
    expect(overall(gateVerdict(aggregate(mixed)))).toBe('fail')
  })

  it('여섯 항목을 전부 보고한다', () => {
    const lines = gateVerdict(aggregate(passingFive()))
    expect(lines.map((l) => l.key)).toEqual(
      ['retryRate', 'fps', 'attempts', 'deathFx', 'load', 'controlBack'])
    for (const l of lines) expect(l.target.length).toBeGreaterThan(0)
  })
})

describe('난이도가 섞인 결과', () => {
  it('게이트 난이도가 아닌 것은 뺀다 — 합격선은 한 난이도의 숫자다', () => {
    const agg = aggregate([
      ...passingFive(),
      tester({ id: 'easy', diff: 'squire', deaths: 100, attempts: 3 }),
    ])
    expect(agg.testers).toBe(5)
    expect(agg.offDifficultyDropped).toBe(1)
    expect(agg.offDifficulty).toEqual([['squire', 1]])
  })

  it('뺀 사람의 사망은 어느 집계에도 안 들어간다', () => {
    const mixed = aggregate([
      ...passingFive(),
      tester({ id: 'easy', diff: 'squire', deaths: 100, causes: { pit: 100 }, hotspots: [[999, 100]] }),
    ])
    const clean = aggregate(passingFive())
    expect(mixed.totalDeaths).toBe(clean.totalDeaths)
    expect(mixed.causes).toEqual(clean.causes)
    expect(mixed.hotspots).toEqual(clean.hotspots)
  })

  it('여러 난이도가 섞이면 많은 순으로 적는다', () => {
    const agg = aggregate([
      ...passingFive(),
      tester({ id: 'p1', diff: 'paladin' }),
      tester({ id: 's1', diff: 'squire' }),
      tester({ id: 'p2', diff: 'paladin' }),
    ])
    expect(agg.offDifficultyDropped).toBe(3)
    expect(agg.offDifficulty).toEqual([['paladin', 2], ['squire', 1]])
  })

  it('난이도가 비어 있으면 넣지 않고 뺀다 — 넘겨짚지 않는다', () => {
    const broken = { ...tester({ id: 'x' }), diff: '' }
    const agg = aggregate([...passingFive(), broken])
    expect(agg.testers).toBe(5)
    expect(agg.offDifficultyDropped).toBe(1)
  })

  it('쉬운 난이도 사람이 섞여 인원만 채운 경우는 표본부족이다', () => {
    const agg = aggregate([
      ...Array.from({ length: 4 }, (_, i) => tester({ id: `t${i}` })),
      tester({ id: 'easy', diff: 'squire' }),
    ])
    expect(agg.testers).toBe(4)
    expect(overall(gateVerdict(agg))).toBe('unknown')
  })

})

describe('낡은 형식', () => {
  it('버전이 다른 꾸러미는 뺀다 — 같은 자리에 다른 뜻의 숫자가 있다', () => {
    const agg = aggregate([...passingFive(), tester({ id: 'old', v: 3, retryRate: 0.2, deaths: 50 })])
    expect(agg.testers).toBe(5)
    expect(agg.staleDropped).toBe(1)
    expect(agg.stale).toEqual([[3, 1]])
  })

  it('여러 버전이 섞이면 많은 순으로 적는다', () => {
    const agg = aggregate([
      ...passingFive(),
      tester({ id: 'o1', v: 3 }), tester({ id: 'o2', v: 1 }), tester({ id: 'o3', v: 3 }),
    ])
    expect(agg.stale).toEqual([[3, 2], [1, 1]])
  })

  it('낡은 꾸러미의 숫자는 어느 집계에도 안 들어간다', () => {
    const mixed = aggregate([...passingFive(), tester({ id: 'old', v: 3, retryRate: 0, deaths: 500 })])
    const clean = aggregate(passingFive())
    expect(mixed.retryRate).toBe(clean.retryRate)
    expect(mixed.totalDeaths).toBe(clean.totalDeaths)
  })

  it('낡은 것으로 인원을 채워도 표본부족이다', () => {
    const agg = aggregate([
      ...Array.from({ length: 4 }, (_, i) => tester({ id: `t${i}` })),
      tester({ id: 'old', v: 3 }),
    ])
    expect(overall(gateVerdict(agg))).toBe('unknown')
  })
})

describe('사망 구간 겹쳐 보기', () => {
  it('수가 같으면 앞 타일이 먼저 온다 — 순서가 흔들리면 못 읽는다', () => {
    const agg = aggregate([
      tester({ id: 'a', hotspots: [[80, 3], [16, 3], [48, 9]] }),
      tester({ id: 'b', hotspots: [] }),
    ])
    expect(agg.hotspots).toEqual([[48, 9], [16, 3], [80, 3]])
  })
})

describe('빌드가 섞였을 때', () => {
  it('한 빌드면 하나로 적는다', () => {
    expect(aggregate(passingFive()).builds).toEqual([['aaaaaaaa', 5]])
  })

  it('둘 이상이면 많은 순으로 적는다', () => {
    const agg = aggregate([
      ...passingFive(),
      tester({ id: 'x', build: 'bbbbbbbb' }),
      tester({ id: 'y', build: 'bbbbbbbb' }),
    ])
    expect(agg.builds).toEqual([['aaaaaaaa', 5], ['bbbbbbbb', 2]])
  })

  it('버리지는 않는다 — 오타 수정과 밸런스 변경을 기계가 못 가른다', () => {
    const mixed = aggregate([...passingFive(), tester({ id: 'x', build: 'bbbbbbbb' })])
    expect(mixed.testers).toBe(6)
    expect(overall(gateVerdict(mixed))).toBe('pass')
  })

  it('빌드가 비어 있으면 개발 빌드로 적는다', () => {
    const agg = aggregate([...passingFive(), tester({ id: 'x', build: '' })])
    expect(agg.builds).toContainEqual(['dev', 1])
  })
})
