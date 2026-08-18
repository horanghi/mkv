# 구현 프롬프트

단계별 프롬프트는 [`prompts/`](prompts/README.md)에 파일 하나씩 분리되어 있다.

**파일 하나가 곧 프롬프트다.** 통째로 복사해서 던지면 된다.

## 실행 순서

```
M0  m0-1-setup → m0-2-game-loop → m0-3-collision → m0-4-movement → m0-5-projectile
    🚦 m0-gate — 점프가 재미있는가

M1  m1-1-sprites → m1-2-armor-states → m1-3-armor-break → m1-4-post-fx
    → m1-5-stage1 → m1-6-audio-hud
    🚦 m1-gate — 재시도율 90%

M2  m2-1-weapons → m2-2-relic-awakening → m2-3-stages-2-4 → m2-4-difficulty

M3  m3-1-phantasm-proto → m3-2-stages-5-6 → m3-3-lucian

M4  m4-1-polish
```

전체 인덱스와 각 프롬프트 요약: [`prompts/README.md`](prompts/README.md)
