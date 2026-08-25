# mkv

> 마령촌 (魔靈村) / GRIMHOLLOW — 마계촌 계보의 웹 기반 하드코어 2D 액션 플랫포머

## 개요

마계촌(Ghosts 'n Goblins)에서 출발한 오리지널 게임.
**M0 게이트 통과. M1 구현 완료 — `m1-gate` 대기 중이다** (재시도율·연출 반응 플레이테스트 필요).
고정 점프 궤도는 확정 — 수치를 바꾸려면 게이트를 다시 통과해야 한다.

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
- **푸시 전에 `npm run build` 와 `npm test` 를 둘 다 돌린다.**
  - `npx vitest run` 만으로는 부족하다. vitest 는 esbuild 라 타입을 보지 않으므로
    `npm run build`(= `tsc`) 에서 깨질 수 있고, 그러면 Vercel 배포가 실패한다.
    (`noUncheckedIndexedAccess` 가 인덱싱에 `| undefined` 를 붙인다.)
  - `npm test` 는 커버리지 임계선까지 본다. `vitest run` 은 안 본다.
  - 둘 다 실제로 한 번씩 깨뜨렸다.
- 계측(`src/telemetry/`)의 **판정 규칙을 바꾸면 `SESSION_VERSION` 을 올린다.**
  항목이 그대로여도 재는 방식이 바뀌면 낡은 기록과 섞을 수 없다.
- **"문서엔 있는데 게임엔 없는 것"이 이 프로젝트의 단골 결함이다.** 상수나
  함수가 주석까지 달고 정의돼 있는데 아무도 읽지 않는 모양으로 나타난다.
  테스트가 그 죽은 쪽에 붙어 있으면 통과하므로 거짓 안심까지 준다.
  `npm run unused` 로 훑는다 — 캐른 안전지대, 사망 연출의 백골 분해,
  시간 초과, 게임 오버 판정이 전부 이 부류였다.

---

## 모델 사용 가이드

- 설계·복잡한 문제 해결 → **fable**
- 구현·단순 작업 → **opus / sonnet**
- 지정된 모델이라도 복잡도에 따라 opus 4.8 또는 fable로 승격

> 상세: `~/.claude/rules/common/model-selection.md`
