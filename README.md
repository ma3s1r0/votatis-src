# Votatis

선거 무결성 아카이브 — 시민 주도 오픈소스. 흩어진 선거 의혹·제보 자료를 사건 단위로 모으고, 신뢰도·타당성·심각도·법적 쟁점을 평가해 검증 가능한 형태로 공개한다.

## 스택

- **Frontend**: Vite + React (SPA) → S3 + CloudFront 정적 배포 — `apps/web`
- **Backend**: Hono (서버리스, AWS Lambda + `hono/aws-lambda`) — `apps/api`
- **Infra**: AWS 멀티-AZ (Lambda/ECS 하이브리드, RDS, S3/CloudFront, Route53, SQS, SES)
- **Monorepo**: pnpm workspace (`apps/*`)

## 시작

```bash
pnpm install
pnpm dev          # web + api 동시 실행
```

- web: http://localhost:5173
- api: http://localhost:8787 (예: `GET /health`)

## 스크립트 (루트)

- `pnpm dev` — 전체 패키지 dev 병렬 실행
- `pnpm build` — 전체 빌드
- `pnpm typecheck` — 전체 타입체크
- 개별: `pnpm --filter @votatis/web <script>`
