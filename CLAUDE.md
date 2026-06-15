# CLAUDE.md

## 프로젝트

Votatis = 선거 무결성 아카이브. 데이터 우선: 수집 → 사건 단위 정리 → 라벨링·검증 → 공개 출력. 톤은 진영색 배제, 객관적 데이터 서비스.

## 구조 (모노레포)

- pnpm workspace(`apps/*`). 앱은 `apps/<name>/`.
  - `apps/web` — Vite + React (SPA) 프론트엔드
  - `apps/api` — Hono 백엔드 (서버리스: `src/lambda.ts` = Lambda 핸들러, `src/index.ts` = 로컬 dev 서버)
- 루트에서 `pnpm -r <script>`로 전체, `pnpm --filter <pkg> <script>`로 개별.

## 확정 스택 (변경 시 합의 필요)

- Frontend: **Vite + React** (Next.js 사용 안 함) → S3 + CloudFront
- Backend: **Hono**, 컴퓨트 **하이브리드** — API는 Lambda(서버리스), 일부 워커는 ECS
- Infra: **AWS** (RDS 다중 AZ, S3/CloudFront, Route53, SQS, SES). Cloudflare 사용 안 함
- DB: **RDS**(Postgres). ORM = **drizzle-orm**, 테스트는 **pglite**(인메모리 Postgres)

## 데이터 무결성 (필수)

선관위 원본은 시간에 따라 바뀐다. 어떤 데이터든 수집 시점·원본 출처·변경 이력·원본 스냅샷·버전을 보관하도록 설계한다. "현재 값만" 가져오는 구현은 지양.

## 개발 워크플로 (SDD + TDD — 필수)

모든 기능은 **스펙 먼저, 테스트 먼저**.

1. **SDD**: 기능은 `specs/`에 스펙부터 만든다. `specs/_template.md` 복사 → `specs/not-started/NNNN-*.md`(목표·비목표·사용자 흐름·테스트 가능한 수용 기준·테스트 계획). 상태 전환은 파일 이동(`not-started`→`in-progress`→`in-review`→`completed`). `specs/README.md` 인덱스를 즉시 동기화.
2. **TDD**: 구현 전에 수용 기준을 **실패 테스트(Red)** 로 작성 → **최소 구현(Green)** → **Refactor**. 테스트 러너는 vitest(`pnpm -r test`).
3. **머지 게이트**: `pnpm -r typecheck && pnpm -r build && pnpm -r test` 모두 통과해야 한다.
4. **멀티에이전트**: planner(스펙) → backend-dev/frontend-dev(Red→Green 병렬) → qa(검증). 역할당 최대 3개. 자세한 규칙은 `specs/README.md`.

---

## 코딩 행동 지침 (karpathy — 항상 적용)

LLM 코딩의 흔한 실수를 줄이기 위한 행동 지침. 사소한 작업엔 판단껏.

### 1. 코딩 전에 생각 — 가정하지 말 것
- 가정은 명시한다. 불확실하면 묻는다.
- 해석이 갈리면 임의로 고르지 말고 제시한다.
- 더 단순한 길이 있으면 말한다. 필요하면 밀어붙인다.
- 불명확하면 멈추고, 뭐가 헷갈리는지 짚고, 묻는다.

### 2. 단순함 우선 — 투기적 추가 금지
- 요청 이상 기능 금지. 일회성 코드에 추상화 금지.
- 요청 안 한 "유연성/설정" 금지. 불가능한 시나리오 에러 처리 금지.
- 200줄이 50줄로 되면 다시 쓴다.

### 3. 외과적 변경 — 건드릴 것만
- 인접 코드·주석·포맷 임의 "개선" 금지. 안 깨진 것 리팩터 금지. 기존 스타일 따른다.
- 무관한 죽은 코드는 언급만, 삭제는 안 한다.
- 내 변경으로 생긴 미사용 import/변수/함수만 정리한다.

### 4. 목표 주도 — 검증 가능한 성공 기준
- "검증 추가" → "잘못된 입력 테스트 작성 후 통과". "버그 수정" → "재현 테스트 작성 후 통과" (SDD/TDD와 일치).
- 강한 성공 기준이 있어야 독립적으로 루프 돈다.
