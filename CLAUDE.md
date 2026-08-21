# mkv

> 마령촌 (魔靈村) / GRIMHOLLOW — 마계촌 계보의 웹 기반 하드코어 2D 액션 플랫포머

## 개요

마계촌(Ghosts 'n Goblins)에서 출발한 오리지널 게임.
**기획 완료. M0 구현 완료 — `m0-gate` 대기 중이다** (테스터 5명 플레이테스트 필요).

| 항목 | 결정 |
|---|---|
| 플랫폼 | 웹 브라우저 (데스크톱 우선, Vercel 배포) |
| 아트 | 모던 픽셀아트 + 셰이더 이펙트 |
| 구조 | 원작형 선형 스테이지 클리어 + 2회차(환마계) |
| 스택 | TypeScript + PixiJS v8 + Vite |

### 산출물

기획서 전체는 [`docs/`](docs/) 에 있다. 진입점은 [`docs/README.md`](docs/README.md).

핵심 문서:
- [`docs/02-core-mechanics.md`](docs/02-core-mechanics.md) — 이동·점프·갑옷 수치 스펙 (**모든 밸런스의 기준**)
- [`docs/06-visual-direction.md`](docs/06-visual-direction.md) — 셰이더 스택, 갑옷 파괴 연출
- [`docs/10-tech-spec.md`](docs/10-tech-spec.md) — 아키텍처, 성능 예산
- [`docs/11-roadmap.md`](docs/11-roadmap.md) — M0~M4 마일스톤

### 개발 착수 시

**구현 세션은 [`GOAL.md`](GOAL.md)를 먼저 읽는다.** 비협상 원칙 6개와 코어 수치가 거기 있다.
작업 지시는 [`prompts/`](prompts/README.md)의 단계별 프롬프트를 순서대로 사용한다.
게이트 파일(`m0-gate.md`, `m1-gate.md`)에서는 반드시 멈추고 검증한다.

### 작업 시 유의

- 수치를 바꿀 때는 `docs/` 의 해당 표를 **함께** 갱신한다. 문서와 코드가 갈라지면 밸런싱이 불가능해진다.
- 개발 착수 시 M0(프로토타입)부터 시작한다. 아트·이펙트보다 **점프 감각 검증이 먼저**다.

---

## 모델 사용 가이드

- 설계·복잡한 문제 해결 → **fable**
- 구현·단순 작업 → **opus / sonnet**
- 지정된 모델이라도 복잡도에 따라 opus 4.8 또는 fable로 승격

> 상세: `~/.claude/rules/common/model-selection.md`
