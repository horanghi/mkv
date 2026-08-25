import { defineConfig } from 'vitest/config'

// 커버리지 목표는 docs/10-tech-spec.md 10.9 를 따른다.
// render/ 와 ui/ 는 시각 검증으로 대체하므로 계측에서 제외한다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/render/**', 'src/ui/**'],
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
      },
    },
  },
})
