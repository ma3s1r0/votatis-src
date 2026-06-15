---
id: 0008
title: 첨부 다운로드 (presigned GET)
status: not-started
owner: backend-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0002]
blocks: []
dev_order: 8   # 0007과 독립이라 병렬 가능.
---

## 목표 (Goal)

현재 첨부 업로드는 2단계 presigned **PUT**(0002)으로 동작하지만, 업로드된 첨부를 **내려받는 경로가 없다**. 업로드 버킷은 비공개라(0002 결정 3) 직접 URL 노출이 불가능하다. 이 스펙은 `StoragePort` 에 `presignGet` 을 추가하고, 공개 상세(0005)·관리 상세(0004)에서 **만료 짧은 다운로드 URL**을 제공한다.

핵심 게이트: **공개 다운로드는 verified 제보의 첨부에만** 발급한다. 미검증 제보는 상세 자체가 404(0002)이므로 첨부 URL도 노출되지 않는다. 민감 메타(원본 exif 위치 등)는 0005 기준대로 계속 제외한다.

## 비목표 (Non-goals)

- 실제 S3 `presignGet` 구현 — StoragePort 인터페이스와 라우트 계약만. 실 AWS 드라이버는 0009.
- CloudFront 서명 URL·CDN 캐싱·이미지 리사이즈/썸네일 파이프라인 — 후속.
- exif stripping(실제 이미지 메타 제거) 파이프라인 — 0005 기준대로 **메타 비표시**로 처리, 바이너리 가공은 후속.
- 첨부 삭제·교체·버전 관리 — 후속.
- 인라인 뷰어(브라우저 내 PDF/이미지 렌더) — 프런트 구현 세부는 0005/후속. 본 스펙은 다운로드 URL 발급 API.

## 사용자 흐름 (User flow)

### A. 공개 다운로드 (verified만)
1. 공개 상세 `GET /api/reports/:id`(0002, verified만) → 응답 attachments 각 항목에 다운로드 경로 또는 별도 발급 엔드포인트 안내.
2. 클라이언트가 `GET /api/reports/:id/attachments/:attachmentId/download` 호출 → 서버가 (report verified ∧ attachment.status=stored) 확인 후 **presigned GET URL**(단기 만료) 반환.
3. 클라이언트가 그 URL로 S3에서 직접 다운로드.

### B. 관리 다운로드 (검토자)
4. 관리 상세(0004, `requireReviewer` 보호) → `GET /api/admin/reports/:id/attachments/:attachmentId/download` → verified 여부 무관(검토 목적) presigned GET URL 반환. 미인증/비active → 401/403.

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

### StoragePort
- [ ] `StoragePort` 에 `presignGet(input: { key; expiresInSeconds }): Promise<{ url; expiresInSeconds }>` 가 추가되고, `InMemoryStorage` 더블이 이를 구현한다(가짜 URL 반환, 존재하지 않는 key 처리 정의).

### 공개 다운로드
- [ ] `GET /api/reports/:id/attachments/:attachmentId/download` 는 report 가 **verified=true** 이고 attachment 가 **status=stored** 이며 해당 report 소속일 때만 presigned GET URL을 반환한다.
- [ ] 미검증 report 의 첨부 다운로드 요청 → **404**(존재 누설 금지, 상세 404와 동일 정책).
- [ ] pending(미finalize) 첨부 다운로드 요청 → **404 또는 409**(결정 3).
- [ ] 다른 report 의 attachmentId 를 끼워 요청 → **404**(소속 불일치 거부).
- [ ] 발급되는 presigned GET URL의 만료가 짧게 설정된다(결정 2).

### 관리 다운로드
- [ ] `GET /api/admin/reports/:id/attachments/:attachmentId/download` 는 `requireReviewer` 통과(active) 시 verified 여부와 무관하게 presigned GET URL을 반환한다.
- [ ] 비인증 → **401**, invited(비active) → **403**.

### 민감정보
- [ ] 공개 다운로드/상세 응답 어디에도 원본 exif 위치 등 민감 메타가 포함되지 않는다(0005 기준 유지). 다운로드되는 바이너리 가공은 비목표지만, API 응답 직렬화에서 exif 위치 필드는 노출하지 않는다.

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`:
  - `attachments.download.test.ts`(신규): verified+stored → URL 발급 / 미검증 report → 404 / pending 첨부 → 404·409 / 소속 불일치 → 404 / 발급 URL 만료값 단언.
  - 관리 경로: `requireReviewer` 게이트(401/403) 후 발급 단언(admin.test-helpers 재사용).
  - `reports.public-contract.test.ts` 확장: 공개 응답에 exif 위치 미포함 유지.
- `InMemoryStorage.presignGet` 동작 단위 확인.
- 먼저 **실패하는** 테스트 작성 후 구현.

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행 — 보수적 기본값)

1. **다운로드 = 별도 엔드포인트로 on-demand 발급**(상세 응답에 URL 인라인 임베드 아님). 근거: presigned URL은 만료가 짧아야 안전한데, 상세 응답에 박아두면 캐싱·재사용 시 만료 어긋남. 클릭 시점에 발급이 만료 관리에 유리.
2. **presigned GET 만료 = 5분**(0002 PUT 만료와 동일 보수값). 메서드 GET 한정.
3. **pending 첨부 → 404**(409 아님). 근거: 공개 경로는 "존재 누설 금지"가 우선 — 미완성 첨부의 존재를 드러내지 않도록 404로 통일. (관리 경로에서 pending 처리는 검토 편의상 404 또는 안내 — 검토자는 stored만 의미 있으므로 404로 단순화.)
4. **공개 게이트 = report.verified ∧ attachment.stored ∧ 소속 일치**. 0002의 verified-only 정책을 첨부 다운로드까지 그대로 확장. 서버 단일 지점에서 강제(클라이언트 신뢰 안 함).
5. **관리 경로는 verified 무관**. 검토자는 판정 전 첨부를 봐야 하므로 status 게이트만(stored). `requireReviewer`(0006/0004 미들웨어) 재사용.

### 무결성
- 다운로드는 읽기 전용 — report/attachment 상태를 변경하지 않는다.
- presign 발급 자체는 S3 객체 존재를 보장하지 않으므로, 게이트는 DB의 attachment.status=stored(finalize 시 headObject로 확인됨, 0002)에 의존한다.

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
