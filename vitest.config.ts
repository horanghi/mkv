import { defineConfig } from 'vitest/config'

// 커버리지 목표는 docs/10-tech-spec.md 10.9 를 따른다.
// render/ 와 ui/ 는 시각 검증으로, 오디오 드라이버는 오프라인 렌더 실측으로
// 대체하므로 계측에서 제외한다. WebAudio 는 node 에서 돌지 않는다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts', 'src/main.ts', 'src/render/**', 'src/ui/**',
        // WebAudio 드라이버. 패턴(bgmPattern.ts)은 순수 모듈로 검증한다.
        'src/core/bgm.ts', 'src/core/sfx.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'src/physics/**': { lines: 95, functions: 95, branches: 95, statements: 95 },
        'src/sprite/**': { lines: 95, functions: 95, branches: 95, statements: 95 },
        'src/fx/**': { lines: 85, functions: 85, branches: 85, statements: 85 },
        'src/entities/**': { lines: 85, functions: 85, branches: 85, statements: 85 },
        'src/game/**': { lines: 85, functions: 85, branches: 85, statements: 85 },
        'src/telemetry/**': { lines: 95, functions: 95, branches: 95, statements: 95 },
        // 배경 생성기. 분기 임계치만 낮은 이유는 남은 분기가 전부
        // noUncheckedIndexedAccess 가 강제하는 `?? 기본값` 가드이기 때문이다.
        // 인덱스가 항상 범위 안이라 실행되지 않는다.
        'src/scenery/**': { lines: 95, functions: 95, branches: 70, statements: 95 },
      },
    },
  },
})
