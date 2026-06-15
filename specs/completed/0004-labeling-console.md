---
id: 0004
title: 라벨링·검증 콘솔 (검토 큐 / 판정 / 근거 강제)
status: completed
owner: backend-dev + web-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0001, 0002, 0006]
blocks: [0005]
dev_order: 3   # 0006(인증) 이후.
---

## 목표 (Goal)

검증된 관리자(reviewer)가 제보를 검토하고 **판정(verification)** 을 다는 콘솔(관리자 web + API)을 정의한다. 판정은 0001의 verification 필드(confidence/validity/severity/legal_issue/verified)를 채우며, **반드시 검증 방법과 근거 링크(최소 1개)** 를 포함해야 한다. **근거 없는 판정은 서버에서 거부**한다. 사람 판단이 AI보다 우선하며, 모든 판정 변경은 0001의 이력 패턴으로 보존된다.

## 비목표 (Non-goals)

- 공개 출력 화면 (→ 0005). 본 콘솔은 내부 검토용.
- 제보 생성/입력 마법사 (→ 0002/0003).
- AI 자동 라벨링/추천 — 비목표(2차). MVP는 사람 판정만.
- 다단계 승인 워크플로(리뷰어→승인자 2인 결재) — MVP는 단일 reviewer 판정. 2인 검증은 후속.
- 일괄(bulk) 판정, 코멘트 스레드/멘션.

## 사용자 흐름 (User flow)

1. reviewer 로그인(0006) → 콘솔 진입. 비인증/비active는 차단(0006 게이트).
2. **검토 큐**: `GET /api/admin/reports?status=pending_review` — 아직 verified 안 된 제보 목록(0002 공개 조회와 달리 **미검증 포함**, 관리자 전용).
3. **상세 검토**: 제보 본문·첨부·출처(0001 스냅샷/해시) 확인.
4. **판정 작성**: `POST /api/admin/reports/:id/verification` — confidence/validity/severity/legal_issue/verified + **method(검증 방법)** + **evidence_links(≥1)** + notes. 근거 누락 시 거부.
5. **판정 수정**: 재검토 시 `PUT` 또는 새 버전 작성 → 이전 판정은 이력 보존(0001 패턴). verified를 false→true 전환 시에도 근거 필수.
6. 판정 후 verified=true 인 제보가 0002/0005 공개 조회에 노출됨.

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

- [ ] 비인증/비active 사용자는 모든 `/api/admin/*` 검토 엔드포인트에서 **401/403**(0006 게이트 적용).
- [ ] reviewer는 검토 큐에서 **미검증 제보를 포함**해 조회할 수 있다(공개 API 0002와 가시성이 다름).
- [ ] verification 작성 시 `method`가 비었거나 `evidence_links`가 **0개**면 **422로 거부**되고, verification 레코드가 생성되지 않는다(서버 강제 — 클라이언트 검증만으로는 통과 불가).
- [ ] 유효한 판정(method + evidence_link≥1 포함) 제출 시 0001 verification 필드가 채워지고 `reviewer`=현재 사용자, `reviewed_at` 기록.
- [ ] verified=true 로 판정된 제보는 직후 0002/0005 공개 조회에 노출된다(연동 확인).
- [ ] 기존 판정을 수정하면 **이전 판정이 이력에 보존**되고(0001 history 패턴) 최신만 활성. 파괴적 덮어쓰기 금지.
- [ ] verified를 true로 올리는 변경도 근거 없으면 거부된다(근거 강제는 생성·수정 모두 적용).
- [ ] confidence/validity/severity/legal_issue 값이 정의된 허용 범위(enum/스케일) 밖이면 **422**.

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`: Hono `app.request` + pglite + 인증 세션(0006) 테스트 헬퍼.
  - `verification.guard.test.ts`: 비인증 401 / 비active 403 / active reviewer 통과.
  - `verification.evidence.test.ts`: **근거 없는 판정 거부(422)** — method 없음 / evidence 0개 / 둘 다. 거부 시 레코드 미생성 단언.
  - `verification.create.test.ts`: 정상 판정 → 필드·reviewer·reviewed_at 기록 / enum 범위 밖 422.
  - `verification.history.test.ts`: 판정 수정 시 이전 버전 이력 보존, 최신만 활성.
  - `verification.publish.test.ts`: verified=true 후 0002 공개 조회에 노출(통합).
- `apps/web` (콘솔): RTL+vitest — 검토 큐 렌더, 판정 폼에서 근거 미입력 시 제출 막힘 + 서버 422 에러 표시, 첨부/출처 표시.

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행)

1. **근거 강제는 서버 권위**. 클라이언트 폼 검증은 UX용일 뿐, 서버가 method/evidence_links를 재검증해 422. 직접 API 호출로도 우회 불가.
2. **evidence_links 저장 = 0001 source 재사용**. 판정 근거 링크는 `source`(kind=url, captured_at·content_hash) 로 보관 — 근거도 무결성 스냅샷 대상. verification ↔ source 연결(verification_evidence 조인 또는 source.verification_id).
3. **판정 수정 = 이력 보존**(0001 `report_history`와 동형의 `verification_history`). 직전 상태 append 후 최신 갱신.
4. **권한 = reviewer(active)**. 0006의 `requireReviewer` 사용. root도 reviewer 권한 포함.
5. **검토 큐 가시성**: 관리자 API는 verified 무관 전체 조회 가능(공개 0002와 분리된 admin 네임스페이스). 공개/관리자 직렬화 분리.
6. **enum/스케일 정의**: confidence·severity 등은 0001에서 nullable 예약된 필드. 본 스펙에서 허용값(예: severity 1–5, validity enum)을 확정하고 서버 검증. (구체 enum 목록은 구현 착수 시 0001 소유자와 1줄 합의 — 기본안: validity∈{valid,partly,invalid,unclear}, severity 1–5, confidence 0–100.)

### 무결성
- 모든 판정은 reviewer·reviewed_at 기록, 변경 이력 보존. 근거 source는 captured_at·content_hash 동반(0001).

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
- 2026-06-15: 서버 구현 (backend-dev). verification·verification_history 테이블, `/api/admin/*` 라우트(검토 큐·상세·판정), 근거 강제(method+evidence≥1 없으면 422, 서버 권위·레코드 미생성), evidence는 0001 source로 무결성 스냅샷 보관, 판정 변경 시 이력 보존. **0006 후속 처리**: app.ts `createApp`에 auth/공개/admin 마운트, admin 라우트 `requireReviewer` 보호(미인증 401·비reviewer/disabled 403).
- 2026-06-15: web 구현 (frontend-dev). 검토 큐·상세·판정 폼(클라 검증+서버 422 fields 표시), ProtectedRoute 가드. react-router 배선.
- 2026-06-15: QA 조건부 PASS(근거강제·인증·이력·가시성 불변식 확인, 회귀 테스트 추가) → backend가 drizzle 마이그레이션 journal(0003) 정합 수정(drizzle-kit "no changes" 확인). api 84 + web 16 통과. status→completed.
