---
id: 0009
title: 운영 배선 (RDS / S3 / Lambda 엔트리)
status: not-started
owner: backend-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0002, 0004, 0006]
blocks: []
dev_order: 9
---

## 목표 (Goal)

지금 `createApp({db, storage})` 팩토리(app.ts)는 auth(/api/auth)·공개(/api)·admin(/api/admin)을 마운트하지만, **실 엔트리(`lambda.ts`·`index.ts`)는 health-only `default app`만 내보낸다**. 즉 실제 DB/S3 드라이버가 배선되지 않아 배포해도 API가 동작하지 않는다. 또한 `StoragePort` 는 인터페이스(presignPut·headObject, 0008에서 presignGet 추가)만 있고 **실 S3 구현이 없다**(테스트 InMemory fake만), DB 는 pglite 테스트 드라이버만 있다.

이 스펙은 운영 배선을 정의한다: ①drizzle **node-postgres(pg)** 드라이버 기반 실 DB 팩토리, ②`StoragePort` 의 **실 S3 구현**(presign PUT/GET, headObject), ③`lambda.ts`/`index.ts` 가 **환경변수로 `createApp` 을 구성·마운트**(CORS·헬스 포함). 테스트는 **구성/단위 수준**(env 파싱·팩토리 생성·라우트 마운트)으로 한정하고, 실 RDS/S3 연결 검증은 배포 환경 의존이라 비목표로 둔다.

## 비목표 (Non-goals)

- **실 RDS/S3 연결을 거는 통합 테스트** — 배포 환경(자격증명·네트워크) 의존. CI에서 실 AWS 호출 안 함. 본 스펙 테스트는 env 파싱·팩토리·마운트만.
- IaC(Terraform/CDK), RDS·S3 버킷·Lambda 함수 프로비저닝, IAM 정책 작성 — 별도 인프라 작업.
- 마이그레이션 자동 실행 파이프라인(배포 시 drizzle-kit migrate) — 후속(메모만 남김).
- 비밀 관리(Secrets Manager/SSM 연동) — env 인터페이스만 정의, 주입 출처는 배포 측.
- 커넥션 풀 튜닝·콜드스타트 최적화·RDS Proxy — 후속(기본 풀만).
- ECS/하이브리드 라우팅(스택 메모의 Lambda+ECS 분리) — 본 스펙은 Lambda+로컬 dev 엔트리. ECS 엔트리는 같은 createApp 재사용 전제로 후속.

## 사용자 흐름 (배포·기동 흐름)

1. **로컬 dev**: `index.ts` 가 env(`DATABASE_URL`, S3 설정, salt, invite base URL 등)를 읽어 실 DB·S3 드라이버로 `createApp` 구성 → `@hono/node-server` 로 기동. (개발자가 로컬 Postgres·S3 호환 스토리지를 가리키게 설정.)
2. **Lambda**: `lambda.ts` 가 동일 env로 `createApp` 구성 → `handle(app)` 로 핸들러 export. 콜드스타트 시 1회 구성, 워밍 인스턴스 재사용.
3. **요청 처리**: API Gateway/Function URL → Lambda → createApp 라우트(/health, /api/*, /api/auth/*, /api/admin/*). CORS 는 허용 오리진(웹 origin) 기준 적용.

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

### 실 DB 팩토리
- [ ] drizzle `node-postgres`(pg) 기반 DB 팩토리 함수가 존재하고, `DATABASE_URL`(또는 분리 env)로 풀/드라이버를 만든다. 반환 타입이 repository/intake/auth 계층이 받는 `Db` 와 **호환**된다(타입체크 통과).
- [ ] `Db` 타입이 pglite 전용에 묶이지 않도록 정리되어, 운영(pg)·테스트(pglite) 양쪽이 같은 계층 함수를 쓸 수 있다(타입체크로 검증).

### 실 S3 StoragePort
- [ ] `StoragePort` 실 구현체가 `presignPut`·`headObject`·`presignGet`(0008)을 제공한다(라이브러리는 결정 2).
- [ ] presign 만료·메서드·Content-Type/Length 바인딩이 0002/0008 계약과 일치한다(단위 테스트: 생성된 URL/요청 형태가 기대 파라미터를 담는지 — 실 네트워크 호출 없이).
- [ ] 버킷명·리전 등은 env에서 읽는다(하드코딩 금지).

### 엔트리 배선
- [ ] `lambda.ts` 와 `index.ts` 가 env를 읽어 실 DB·S3로 `createApp` 을 구성·마운트한다(더 이상 health-only default app 아님).
- [ ] 필수 env 누락 시 **명확한 에러로 기동 실패**(조용한 잘못된 기본값 금지). 어떤 env가 빠졌는지 메시지에 나온다.
- [ ] CORS 가 허용 오리진(env)으로 설정되고, 자격증명 포함 요청(쿠키, 0006)을 허용한다.
- [ ] `/health` 가 DB·구성과 무관하게 200을 반환한다(헬스체크는 의존성 없이 동작).

### 구성/단위 테스트 (실 AWS 없이)
- [ ] env 파싱 함수가 유효 env → 구성 객체, 누락 env → 에러를 반환한다(단위 테스트).
- [ ] 구성된 앱이 `/health`·`/api/*`·`/api/auth/*`·`/api/admin/*` 라우트를 마운트했는지 검증한다(존재하는 경로가 404 아닌 응답, S3·DB는 fake/모킹 주입).
- [ ] 실 RDS/S3 연결 테스트는 본 스펙 비목표임이 문서에 명시되고, 테스트는 그것을 시도하지 않는다.

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`:
  - `config.env.test.ts`(신규): 유효 env 파싱 / 필수 누락 시 에러 / CORS 오리진 파싱.
  - `app.mount.test.ts`(또는 기존 `app.test.ts` 확장): createApp(또는 구성 함수)이 /health·각 prefix 라우트를 마운트했는지(fake db·storage 주입으로). 실 드라이버 미사용.
  - 실 S3 구현 단위: presign 입력 → 기대 메서드/만료/헤더 조건을 담은 결과(서명 계산은 검증하되 네트워크 호출 없음). 실 자격증명 불필요한 형태로.
- 실 RDS/S3 연결은 **테스트하지 않는다**(비목표). 배포 환경 스모크는 운영 절차 메모로.
- 먼저 **실패하는** 테스트 작성 후 구현.

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행 — 보수적 기본값)

1. **DB 드라이버 = drizzle `node-postgres`(pg)**. 근거: 0001 이 Postgres/RDS 확정, pglite 와 동일 방언. Lambda 콜드스타트에 풀 생성 비용이 있으나 MVP는 기본 `pg.Pool`(작은 max). RDS Proxy/serverless 드라이버는 후속. **`Db` 타입을 pglite 고정에서 공용 인터페이스로 일반화**해 운영/테스트가 같은 repository 함수를 공유(현재 `Db = PgliteDatabase<...>` 가 결합 지점 — 정리 필요).
2. **S3 라이브러리 = `aws4fetch`** 우선(경량·Lambda 번들 작음·SigV4 직접). 대안 `@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner`(기능 풍부하나 번들 큼). MVP는 presign(PUT/GET)+headObject만 필요하므로 경량 우선. 최종 선택은 구현 시 번들/유지보수 트레이드오프로 1줄 합의하되, **인터페이스(StoragePort)는 불변**이라 교체가 라우트에 안 샌다.
3. **env 인터페이스(MVP 최소)**: `DATABASE_URL`, `AWS_REGION`, `S3_BUCKET`, (자격증명은 Lambda 실행 역할/환경에서), `SUBMITTER_SALT`, `INVITE_BASE_URL`, `CORS_ORIGINS`(콤마구분), `SESSION_*`(0006 쿠키 도메인/secure). 비밀 출처(Secrets Manager 등)는 배포 측, 코드는 env만 읽음.
4. **구성 실패 = fail-fast**. 필수 env 누락 시 기동 단계에서 throw(헬스 200 후 첫 요청에 500 뿌리는 식 회피). 단 `/health` 는 DB 미연결에도 200(로드밸런서 헬스용).
5. **CORS**: 0006 쿠키 인증(credentials:include) 때문에 와일드카드 오리진 불가 → env의 명시 오리진 목록 + `credentials: true`. 동일 오리진 배포면 비워둘 수 있음(0006 결정 6과 정합).
6. **default app 처리**: 기존 health-only `default app` 은 엔트리에서 실 createApp 으로 대체. health-only export 가 다른 곳에서 참조되면(스모크 등) 호환 위해 named export 로 분리할지 구현 시 확인(현재 `app.test.ts` 가 default app 의존하면 그 기대를 새 구성으로 이전).

### 무결성 / 운영
- 마이그레이션은 **배포 단계에서 별도 실행**(drizzle-kit migrate). 앱 기동이 자동 마이그레이션하지 않음(동시성·롤백 안전). 본 스펙은 실행 훅 위치만 메모, 파이프라인은 후속.
- presign·DB 자격증명은 로그에 남기지 않는다(민감정보 로깅 금지).

### 의존 정렬 메모
- 0002(공개/첨부)·0004(admin 콘솔)·0006(auth)이 모두 createApp 에 마운트됨 → 본 스펙은 그 세 묶음을 실 드라이버로 한 번에 띄운다. 0007/0008이 추가 라우트를 더해도 createApp 마운트에 자동 포함(엔트리 변경 불필요).

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
