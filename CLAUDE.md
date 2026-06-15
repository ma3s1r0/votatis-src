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
