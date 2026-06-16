# Votatis 테스트 배포 (구성 A — 최소·저비용)

코드가 이미 지원하는 **서버리스(Lambda)** 로 가는 테스트용 구성. 인프라 이미지의
풀 구성(ALB+ECS+ASG, multi-AZ RDS, SQS/SES/Route53)은 **프로덕션 목표**이고, 여기선
프리티어 위주로 단순화한다.

```
브라우저 ──> CloudFront ──┬─ /*      ─> S3 (web, 비공개·OAC)
                          └─ /api/*  ─> API Gateway(HTTP) ─> Lambda(api, VPC)
                                                                   │
                       Lambda(migrate, VPC, 배포 중 1회 자동) ──── ┼─> RDS Postgres(단일 AZ, 프라이빗)
                                                                   └─> S3(첨부, presigned)
VPC: 2 AZ, NAT 게이트웨이 없음 · S3 게이트웨이 엔드포인트로 Lambda→S3
```

## 비용 (서울 ap-northeast-2 기준, 대략)

| 리소스 | 프리티어(가입 12개월) | 이후/초과 |
| --- | --- | --- |
| RDS `db.t3.micro` 단일 AZ, 20GB | 750h/월 + 20GB 무료 | ~$13–15/월 |
| Lambda(api/migrate) | 100만 호출·40만 GB-s 무료 | 거의 0 |
| API Gateway(HTTP) | 100만 호출 무료(12개월) | $1/백만 |
| CloudFront | 1TB 전송·1천만 요청 무료 | 소액 |
| S3(web+첨부) | 5GB 무료 | 소액 |
| **NAT 게이트웨이** | **없음(0원)** — 의도적으로 회피 | — |

프리티어 계정이면 **테스트 중 사실상 무료~월 몇 달러**. 12개월 지났거나 프리티어 소진 시
RDS가 주 비용(~$15/월). 안 쓸 땐 `npm run destroy` 로 전부 삭제.

## 사전 준비

- Node 20+ / pnpm 9 (이미 사용 중)
- **Docker 불필요** — 네이티브 모듈(`@node-rs/argon2`) Linux 바이너리는
  `pnpm.supportedArchitectures`(루트 package.json) + `build:lambda` 로 동봉한다.
- AWS 계정 + **스코프된 IAM 사용자 액세스 키**(루트 키 금지).
  - 테스트 편의상 권한: `AdministratorAccess`(가장 간단) 또는 최소한 CloudFormation·
    IAM·EC2(VPC)·RDS·Lambda·S3·CloudFront·APIGatewayV2·SecretsManager·Logs.
- 리전 선택(기본 `ap-northeast-2`).

> AWS CLI는 필수가 아니다(CDK가 SDK로 직접 호출). 자격증명만 환경에 있으면 된다.

## 1) 자격증명 설정

터미널에서(세션에 노출하지 않으려면 본인 셸에서 직접):

```fish
set -x AWS_ACCESS_KEY_ID     <발급키>
set -x AWS_SECRET_ACCESS_KEY <시크릿>
set -x AWS_REGION            ap-northeast-2
set -x CDK_DEFAULT_REGION    ap-northeast-2
```

(bash/zsh면 `export KEY=...`)

## 2) 아티팩트 빌드

```bash
# 레포 루트
pnpm install                       # supportedArchitectures 로 linux argon2 바이너리도 수신
pnpm --filter @votatis/api build:lambda   # apps/api/dist/lambda/{api,migrate}
pnpm --filter web build                   # apps/web/dist
```

## 3) 배포

```bash
cd infra
npm install
npx cdk bootstrap          # 계정·리전 최초 1회(CDK 자산 버킷 생성)
npx cdk deploy
```

- 약 10–20분(주로 RDS 생성). 끝나면 출력에 `VotatisTest.SiteUrl`(CloudFront URL),
  `ApiEndpoint`, `MigrateFunctionName`, `*SecretArn` 가 나온다.
- 마이그레이션 + 관리자 부트스트랩은 **배포 중 `MigrateTrigger` 가 자동 실행**한다
  (drizzle 저널 기반 — 재배포 시 멱등).

## 4) 로그인 정보

부트스트랩 관리자/검증자(0017 2인 교차검증용):

- 관리자: `admin@votatis.local` — 비밀번호는 시크릿 `AdminPasswordSecretArn` 에 생성됨
- 검증자2: `reviewer2@votatis.local` — 시크릿 `Reviewer2Password`

콘솔(Secrets Manager)에서 값 확인, 또는 aws-cli 설치 시:

```bash
aws secretsmanager get-secret-value --secret-id <AdminPasswordSecretArn> --query SecretString --output text
```

## 5) 확인

- `SiteUrl` 접속 → SPA 로드, 아카이브는 비어 있음(부트스트랩은 데이터 시드 안 함, 관리자만).
- 제보 작성 → 첨부 업로드(presigned PUT)까지 실제 S3 경로로 동작.
- `/admin` 로그인 → 검수 큐. 두 계정으로 교차검증 → 공개.

## 6) 초대 링크(선택)

`InviteBaseUrl` 파라미터 기본값은 placeholder다. 관리자 초대 메일 링크를 실제 도메인으로
하려면 첫 배포 후 CloudFront URL 로 갱신:

```bash
npx cdk deploy --parameters InviteBaseUrl=https://<배포된 CloudFront 도메인>
```

## 7) 정리(과금 중단)

```bash
cd infra && npx cdk destroy
```

RDS·S3 버킷 포함 전부 삭제(removalPolicy=DESTROY, autoDeleteObjects). 보존하려면 배포 전
`removalPolicy`/`deletionProtection` 를 조정.

## 프로덕션과의 차이(나중에)

- API: Lambda → ECS Fargate + ALB(이미지대로), Auto Scaling
- RDS: 단일 AZ → multi-AZ + 읽기 복제본, 백업 보존, 삭제 보호
- 프라이빗 서브넷 아웃바운드 필요 시 NAT 게이트웨이(또는 인터페이스 엔드포인트)
- SES(메일)·SQS(워커 큐)·Route53(커스텀 도메인) 추가
- 시크릿을 env 직접 주입 대신 런타임 Secrets Manager 조회로
