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
- DB: **RDS** (ORM·스키마는 후속 작업에서 결정)

## 데이터 무결성 (필수)

선관위 원본은 시간에 따라 바뀐다. 어떤 데이터든 수집 시점·원본 출처·변경 이력·원본 스냅샷·버전을 보관하도록 설계한다. "현재 값만" 가져오는 구현은 지양.

## 개발 워크플로 (SDD + TDD — 필수)

모든 기능은 **스펙 먼저, 테스트 먼저**.

1. **SDD**: 기능은 `specs/`에 스펙부터 만든다. `specs/_template.md` 복사 → `specs/not-started/NNNN-*.md`(목표·비목표·사용자 흐름·테스트 가능한 수용 기준·테스트 계획). 상태 전환은 파일 이동(`not-started`→`in-progress`→`in-review`→`completed`). `specs/README.md` 인덱스를 즉시 동기화.
2. **TDD**: 구현 전에 수용 기준을 **실패 테스트(Red)** 로 작성 → **최소 구현(Green)** → **Refactor**. 테스트 러너는 vitest(`pnpm -r test`).
3. **머지 게이트**: `pnpm -r typecheck && pnpm -r build && pnpm -r test` 모두 통과해야 한다.
4. **멀티에이전트**: planner(스펙) → backend-dev/frontend-dev(Red→Green 병렬) → qa(검증). 역할당 최대 3개. 자세한 규칙은 `specs/README.md`.
