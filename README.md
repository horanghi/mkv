# 마령촌 · GRIMHOLLOW

마계촌(Ghosts 'n Goblins) 계보의 웹 기반 하드코어 2D 액션 플랫포머.

**현재 M1 구현 완료, `m1-gate` 대기.** 검증할 질문은 하나다 —
*죽고 나서 바로 다시 하는가?*

## 플레이

**https://mkv-five.vercel.app** — 스테이지 1 (로그인 불필요)

테스터에게 보낼 안내문은 [`prompts/m1-gate-testers.md`](prompts/m1-gate-testers.md) 에 있다.

## 실행

```bash
npm install
npm run dev
```

Node 22.17.0 (`.nvmrc`). PixiJS v8 · TypeScript 7 · Vite · Vitest.

| 스크립트 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (HMR) |
| `npm run build` | 타입 검사 후 프로덕션 빌드 → `dist/` |
| `npm test` | 유닛 테스트 + 커버리지 |
| `npm run test:watch` | 감시 모드 |
| `npm run typecheck` | 타입 검사만 |
| `npm run preview` | 프로덕션 빌드를 로컬에서 확인 |
| `npm run deploy` | Vercel 프로덕션 배포 |
| `npm run gate` | 테스터 결과를 합쳐 게이트 판정 |

> `main` 에 푸시하면 Vercel 이 자동으로 프로덕션 배포한다 (GitHub App 연동).
> `npm run deploy` 는 푸시 없이 로컬 상태를 즉시 올릴 때만 쓴다.

### 조작

| 키 | 동작 |
|---|---|
| `←` `→` | 이동 |
| `Z` / `Space` | 점프 |
| `X` | 창 던지기 (`↑`/`↓` 조합으로 상하 발사) |
| `↓` | 웅크리기 |
| `R` | 리셋 |
| `F1` | 디버그 오버레이 |
| `F2` | 점프 궤도 표시 · 히트박스 |
| `F3` | 성유물 갑옷 획득 (상자는 M1-5) |
| `F4` | 피격 한 대 (적은 M1-5) |
| `F5` | 화질 전환 (높음 · 보통 · 낮음) |

지면의 구덩이는 왼쪽부터 **2 · 3 · 4타일**이다. 4타일은 넘지 못하는 것이 정상이다.

## 구조

```
src/core/       엔진 (설정, 뷰포트, 루프, 입력, 에셋)
src/physics/    AABB 스윕 콜리전, 타일맵 질의
src/entities/   플레이어 · 적 · 보스 · 투사체
src/render/     레이어, 광원, 포스트FX, 디버그
src/game/       게임 상태, 스테이지, 체크포인트
src/ui/         HUD, 메뉴
src/fx/         연출 로직 (타임라인 · 파편 · 광원 · 품질)
src/sprite/     도트 매트릭스 · 클립
src/data/       밸런스 JSON · 스테이지
```

## 수치는 코드에 쓰지 않는다

이동 속도·데미지·HP 같은 밸런스 값은 전부 [`src/data/*.json`](src/data/)에 있고,
그 원본 표는 [`docs/`](docs/README.md)에 있다.

`src/data/load.test.ts`가 둘의 일치를 강제한다. 표를 고치면 테스트가 깨지는 것이 정상이다.

## 문서

| 문서 | 내용 |
|---|---|
| [`GOAL.md`](GOAL.md) | 빌드 지시문. 비협상 원칙 6개 |
| [`docs/`](docs/README.md) | 기획서 12종 |
| [`prompts/`](prompts/README.md) | 단계별 구현 프롬프트 |

구현 세션은 `GOAL.md`부터 읽는다.

## 라이선스

[MIT](LICENSE) — 코드·문서·도트 모두 포함한다.

마계촌(Ghosts 'n Goblins)은 캡콤의 상표다. 이 프로젝트는 그 계보에서 출발한
**오리지널 게임**이며 캡콤과 아무 관계가 없다. MIT 는 이 저장소의 저작물에만
적용되고, 남의 상표에 대한 권리를 주지 않는다.
