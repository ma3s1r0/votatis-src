---
id: 0020
title: AWS 최소·저비용 테스트 배포 (구성 A — 서버리스/프리티어)
status: completed
owner: backend/infra
created: 2026-06-16
updated: 2026-06-16
---

## 목표 (Goal)
실 사용자(모바일 포함)가 접속해 제보→첨부 업로드→관리자 검수→교차검증→공개까지
end-to-end로 만져볼 수 있는 **테스트 배포**를 AWS에 올린다. 비용은 프리티어 위주로
최소화한다(테스트 중 사실상 무료~월 몇 달러). 인프라 이미지의 풀 구성(ALB+ECS+ASG,
multi-AZ RDS, SQS/SES/Route53)은 **프로덕션 목표**이고, 본 스펙은 그것을 코드가 이미
지원하는 서버리스 경로로 단순화한 **구성 A**다(이미지는 참고용).

## 비목표 (Non-goals)
- 프로덕션 고가용성(multi-AZ, Auto Scaling, ECS/ALB) — 나중에.
- 커스텀 도메인/Route53, SES(메일), SQS(워커 큐) — 테스트 범위 밖.
- CI/CD 파이프라인 — 로컬에서 `cdk deploy` 수동.
- 시크릿 런타임 조회(Secrets Manager fetch) — 테스트는 env 직접 주입 허용.

## 사용자 흐름 (User flow)
```
브라우저 → CloudFront ┬ /*     → S3(web, 비공개·OAC)
                      └ /api/* → API Gateway(HTTP) → Lambda(api, VPC)
                                                        │
   배포 중 Trigger → Lambda(migrate, VPC) ──────────────┼→ RDS Postgres(단일 AZ, 프라이빗)
                                                        └→ S3(첨부, presigned PUT/GET)
VPC: 2 AZ · NAT 게이트웨이 없음 · S3 게이트웨이 엔드포인트로 Lambda→S3
```
배포자: `~/.aws` 프로필(스코프 IAM) 설정 → 아티팩트 빌드 → `cdk bootstrap` → `cdk deploy`.
마이그레이션+관리자 부트스트랩은 배포 중 자동(멱등). 절차는 `infra/DEPLOY.md`.

## 수용 기준 (Acceptance criteria — 테스트 가능하게)
- [x] `S3Storage`가 `AWS_SESSION_TOKEN`(Lambda 역할 임시자격증명)을 SigV4 서명에 반영
      (presigned URL에 `X-Amz-Security-Token`), 정적 키일 때는 미포함.
      → `apps/api/src/storage.s3.test.ts`
- [x] `loadConfig`가 `AWS_SESSION_TOKEN`을 선택적으로 읽어 s3 설정에 전달.
- [x] `build:lambda`가 Docker 없이 Linux 타깃 아티팩트 생성: 네이티브 `@node-rs/argon2`만
      external + linux-x64 `.node` 동봉, 나머지 esbuild 번들, `handler` export, migrate에
      drizzle SQL/저널 포함. → `apps/api/dist/lambda/{api,migrate}` 구조 확인.
- [x] `migrate.ts`: drizzle `migrate()` 적용 + `seedRoot` 관리자/검증자2 부트스트랩(멱등).
- [x] `cdk synth`/`tsc` 통과(IaC 구조 검증), 머지 게이트(web+api 테스트) 그린.
- [x] **라이브**: `cdk deploy` 성공(59/59) → 출력 `SiteUrl=https://d310w3hawqwcup.cloudfront.net`,
      `ApiEndpoint=https://1xza1k9qy5.execute-api.ap-northeast-2.amazonaws.com`.
- [x] **라이브**: `SiteUrl` SPA 로드(200), `/api/reports` 동일 오리진으로 API 도달(JSON 200).
- [x] **라이브**: 부트스트랩 관리자(`admin@votatis.local`)로 `POST /api/auth/login` 200 + 세션 쿠키.
      (= 마이그레이션·부트스트랩·DB 연결 모두 정상)
- [ ] **라이브(수동)**: 제보 생성 + 첨부 presigned PUT(실 S3) — UI로 확인 예정.
- [ ] **라이브(수동)**: 2계정 교차검증 → 공개 반영 — UI로 확인 예정.
- [ ] **정리**: `cdk destroy`로 RDS·버킷 포함 전부 삭제(과금 중단) — 테스트 종료 시.

## 테스트 계획 (TDD — Red 먼저)
- 코드 갭은 단위 테스트로 가드: S3 세션토큰 회귀 2건(주입 시 포함 / 미지정 시 미포함).
- IaC는 런타임 단위테스트 부적합 → `cdk synth`(구조) + 실제 `cdk deploy`(라이브 수용)로 검증.
- 머지 게이트: `pnpm -r typecheck && build && test`(web 173 + api 204 그린).

## 설계 메모 (Design notes)
- **NAT 회피**: Lambda를 VPC 내부(프라이빗 isolated)에 두어 RDS에 직접 접근, 외부(S3)는
  게이트웨이 엔드포인트로. NAT 게이트웨이(~$32/월) 불필요.
- **동일 오리진**: CloudFront가 `/api/*`를 API GW로 라우팅 → 쿠키 인증(0006) 그대로,
  CORS 불필요(`CORS_ORIGINS` 비움). Host 헤더는 ALL_VIEWER_EXCEPT_HOST로 origin에 위임.
- **네이티브 모듈**: 인증 해시 `@node-rs/argon2`가 네이티브 → Lambda(Linux) 바이너리 필요.
  Docker 없이 루트 `pnpm.supportedArchitectures`(linux-x64)로 바이너리 수신 후 `build:lambda`가
  argon2 폴더에 `.node` 직접 주입(로더 1순위 경로). esbuild는 native만 external.
- **마이그레이션 무결성**: drizzle 저널 기반 `migrate()` → 재배포 시 멱등. 앱은 기동-마이그레이션
  안 함(레이스 회피). 부트스트랩은 데이터 시드 없이 관리자/검증자2만(0017 교차검증 가능하게).
- **비용/정리**: RDS 단일 AZ t3.micro, `removalPolicy=DESTROY`, `autoDeleteObjects` → `cdk destroy`로 전액 중단.
- **EC2 제약(회귀)**: 보안그룹 규칙 description은 ASCII 한정 charset만 허용 → 비ASCII(예: `→`) 금지.

## Changelog
- 2026-06-16: 스펙 작성(구현 선행 — infra). 구성 A IaC(`infra/`) + Lambda 패키징 + 코드 갭
  해결 머지(main).
- 2026-06-16: 배포 1차 실패(SG description 비ASCII `→`)→ASCII 수정. 2차 실패(57/59,
  RDS SSL 강제 — `no pg_hba.conf entry ... no encryption`)→`DATABASE_URL`에 `sslmode=no-verify`
  추가. 3차 성공(59/59, MigrateTrigger 통과). 라이브 스모크(SPA/API/RDS/admin 로그인) 통과
  → completed. 제보·교차검증 UI 확인 및 `cdk destroy`는 테스트 종료 시.
