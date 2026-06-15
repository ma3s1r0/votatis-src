---
id: 0002
title: 제보 수집 API (생성 / 첨부 업로드 / 공개 조회)
status: completed
owner: backend-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0001]
blocks: [0003, 0005]
dev_order: 2   # 0006과 독립이라 병렬 가능.
---

## 목표 (Goal)

시민·검증팀이 제보를 올리고 첨부 파일을 업로드하며, 일반 대중이 **검증 통과분만** 조회할 수 있는 **Hono/Lambda API**를 정의한다. 0001 데이터 모델(report/attachment/source/event) 위에 올라간다. 첨부는 API 서버를 거치지 않고 **S3 presigned URL** 로 직접 업로드하되, 무결성(0001의 sha256/collected_at)을 보장한다.

## 비목표 (Non-goals)

- 입력 마법사 UI (→ 0003).
- 라벨링/검증 판정 (→ 0004). 본 API는 verification 필드를 **읽기**만 하고(공개 필터용) 쓰지 않는다.
- 공개 출력 화면(리스트/검색 UI) (→ 0005). 본 스펙은 조회 **API**만.
- 외부 캡차(Turnstile/reCAPTCHA) 의무화 — 후속 옵션으로 명시(아래 결정 5).
- 동영상/대용량 스트리밍 업로드, 바이러스 스캔 파이프라인 — 후속.

## 사용자 흐름 (User flow)

### A. 제보 생성 (2단계 첨부 패턴)
1. `POST /api/reports` — 본문(제목/내용/발생시점/분류/지역/출처) 제출 → report 생성(status=submitted, `collected_at` 자동 기록), 익명 제출자 해시 기록. 응답에 report_id.
2. **첨부 create**: `POST /api/reports/:id/attachments/create` — 파일 메타(파일명/mime/size/예상 sha256) 제출 → 검증 후 **S3 presigned PUT URL** + attachment_id(status=pending) 반환.
3. 클라이언트가 presigned URL로 **S3에 직접 PUT**(API 미경유).
4. **첨부 finalize**: `POST /api/reports/:id/attachments/:attachmentId/finalize` — 업로드 완료 통지 → 서버가 S3 객체 존재·크기 확인, sha256 확정(0001), attachment.status=stored.

### B. 공개 조회 (검증 통과분만)
5. `GET /api/reports` — 목록(페이지네이션). **verified=true 인 report만** 반환.
6. `GET /api/reports/:id` — 상세. verified가 아니면 **404**(미검증 존재 누설 금지).

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

- [ ] `POST /api/reports` 성공 시 report가 status=submitted, `collected_at` 자동 기록, 익명 submitter 해시가 저장되고 report_id를 반환한다.
- [ ] 필수 필드 누락/형식 오류 본문은 **400**과 어떤 필드가 문제인지 반환(스키마 검증).
- [ ] 출처(source)를 함께 보내면 0001 규칙대로 `captured_at`+`content_hash` 없는 source는 **거부(400)**.
- [ ] `attachments/create` 는 허용 mime/size 내에서만 presigned PUT URL을 발급하고 attachment(status=pending)을 만든다. 허용 외 mime/초과 size → **400/413**.
- [ ] presigned URL의 만료가 짧게 설정된다(결정 3).
- [ ] `finalize` 는 S3에 객체가 실제 존재할 때만 status=stored로 전환하고 sha256을 확정한다. 객체 없으면 **409/400**.
- [ ] `GET /api/reports` 와 `GET /api/reports/:id` 는 **verified=true 인 것만** 노출한다. 미검증/제출중 report는 목록에 없고, 직접 ID 조회 시 **404**.
- [ ] 동일 IP의 제보 생성에 **rate limit** 적용(0001 DB 기반). 초과 시 **429**.
- [ ] 응답에 submitter 원본 식별정보(원 IP/원문 식별자)가 포함되지 않는다(해시만, 공개 응답엔 미노출).

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`: Hono `app.request` + pglite 통합 테스트. S3는 인터페이스 추상화 후 **테스트 더블**(presign·headObject 모킹).
  - `reports.create.test.ts`: 정상 생성(collected_at·status·해시) / 필수 누락 400 / source 무결성 거부 / rate limit 429.
  - `attachments.test.ts`: create가 허용 mime/size에서만 presigned 발급 / 허용 외 거부 / finalize는 객체 존재 시에만 stored / 객체 없으면 거부.
  - `reports.read.test.ts`: 목록·상세가 verified=true만 노출 / 미검증 ID 조회 404 / 페이지네이션.
- 공개 응답 직렬화에 민감 필드(원 IP 등)가 없는지 단언하는 테스트.

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행)

1. **첨부 = 2단계 presigned PUT**(create→finalize). 근거: 큰 파일이 Lambda 본문을 통과하지 않음(payload 한도·비용 회피). finalize로 서버가 실제 업로드를 확인해 0001 무결성(sha256·존재)을 보장.
2. **공개 조회 게이트 = verified=true 단일 필터**. 미검증은 목록 누락 + 상세 404(403 아님 — 존재 자체 비노출). 0005도 이 API를 그대로 신뢰.
3. **presigned URL 만료 = 5분**, 메서드 PUT 한정, Content-Type/Content-Length 조건 바인딩. 업로드 버킷은 비공개(공개 노출은 0005에서 CloudFront 서명/프록시 검토).
4. **rate limit = DB 기반**(0001 패턴, IP 키). 생성·attachments/create에 적용. 외부 캡차는 별도.
5. **봇/스팸 방지 단계화**: MVP 기본 = IP rate limit + 스키마 검증 + (선택)honeypot 필드. **Turnstile/reCAPTCHA 등 외부 캡차는 후속 옵션** — 본 API는 캡차 토큰 검증 훅 자리만 남기고(미설정 시 무시) 의무화하지 않는다.
6. **허용 첨부**: 이미지(jpeg/png/webp)·PDF, 개당 size 상한(예: 15MB) 기본. exif는 0001대로 보관하되 공개 시 위치정보 노출 주의는 0005에서.
7. **submitter 익명화**: IP 등은 **솔트 해시**로만 저장(0001), 공개 직렬화에서 제외. 동일인 식별은 운영용 해시 비교로 한정.

### 무결성
- report 생성 = `collected_at` 서버 시각(클라이언트 시각 불신). source 스냅샷·해시는 0001 규칙 그대로 강제.
- finalize 시 서버가 S3 headObject로 size 일치 확인 후 sha256 확정. 불일치 시 stored 전환 거부.

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
- 2026-06-15: 구현 (backend-dev). StoragePort 추상화(presign/headObject, 테스트 InMemory fake), 첨부 2단계(create→PUT→finalize, sha256/객체존재 검증), 공개 조회 verified-only(미검증 404)+민감필드 제외, 페이지네이션·q·sido 필터. 마이그레이션 0002. QA 조건부 PASS.
- 2026-06-15: QA 수정 (backend). 첨부 create 에 POST /reports 와 동일한 IP rate limit(429) 적용, 없는 reportId create 시 FK 위반 500 대신 404. expectedSha256 은 선택; 서버는 finalize 시 항상 storage 의 실제 sha256 을 기록(+ size 검증), expectedSha256 제출 시에만 추가 대조해 불일치면 409. → QA 재검증 통과, status→completed.
