import { defineConfig } from 'vite'

// 정적 배포(Vercel). 논리 해상도 업스케일은 런타임이 담당하므로 빌드는 단순하다.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // pixi 를 별도 청크로 분리해 게임 코드만 바뀔 때 캐시가 살아남게 한다.
        manualChunks(id: string): string | undefined {
          return id.includes('node_modules/pixi.js') ? 'pixi' : undefined
        },
      },
    },
  },
})
