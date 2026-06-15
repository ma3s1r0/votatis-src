---
id: 0011
title: UX 풀리뷰 + 라이브 테스트 개선 (P0 인증 버그 포함)
status: in-progress
owner: 기획/프론트
created: 2026-06-15
updated: 2026-06-15
---

## 목표 (Goal)
0001~0010 완료 후 로컬 dev 서버(pglite)로 실제 구동·브라우저 테스트하면서 발견한 결함·UX 이슈를 한 묶음으로 정리해 해결한다. 핵심은 **관리자 인증을 완전히 깨뜨리는 P0 경로 불일치 버그**다. 그 위에 제보 마법사·검토 폼·공개 아카이브의 플로우 단절과 표시 일관성(날짜·해시·enum 라벨·공통 네비)을 보강해 "객관적 데이터 서비스"라는 톤에 맞는 사용 경험을 만든다.

수정 범위는 대부분 web(`apps/web`)이며, 서버(`apps/api`)는 정상이므로 **건드리지 않는다**(예외: 없음). 기존 전 스펙(0001~0010) 테스트 회귀 0이 절대 조건이다.

## 비목표 (Non-goals)
- 서버 API 변경. P0/P1/P2 모두 web에서 해결한다. 서버는 이미 `/api/auth/*` + `/api/admin/*` 분리, `unverifiedClaims` 지원, presigned download 등을 제공한다.
- 첨부 **다중** 업로드(여러 파일). 이번엔 단일 첨부 유지. 출처는 다중 입력 포함(아래 스코프 결정 참고).
- 제보 접수번호 기반 추적 조회 기능 구현(추후). 이번엔 문구만 오해 없게 정정.
- 디자인 토큰 자체의 변경/추가(0010 산출물 사용만). 관리 콘솔에 적용만 한다.
- AI 자동 판정·라벨링. 사람 판단 우선 원칙 유지.
- 새로운 라우트/엔드포인트 추가.

## 사용자 흐름 (User flow)

### 관리자(검토자)
1. `/admin/login` → 이메일/비밀번호 → 로그인 성공 시 세션 쿠키 발급, `/admin`으로 이동.
2. `/admin/queue` → 검토 큐. 각 항목에 지역·분류·발생/수집 시점 맥락 표시.
3. `/admin/reports/:id` → 상세에서 맥락(지역·분류·발생/수집 시점·기존 판정 이력) 확인 → 판정 폼 작성(유효성·심각도·신뢰도·검증여부·**확인되지 않은 주장**·근거 링크 ≥1·메모) → 제출.
4. 초대 수락: `/admin/invite/:token` → 비밀번호 설정 → 활성화.

### 제보자(공개)
1. 홈 `/` → 프로젝트 소개·신뢰 메시지·CTA(아카이브/제보) → 둘 중 하나로 진입.
2. `/report` 마법사 1~5단계 → Step5 요약에서 **본문·출처 URL·발생 시점·선거 포함** 전 항목 확인 → 동의 체크 → 제출.
3. 제보 완료 화면 → **다음 행동 링크**(공개 아카이브/홈/추가 제보) 제공.
4. `/archive` → 검색·필터(지역/분류/선거) → 상세 `/archive/:id` → 출처·첨부 다운로드·검토 요약(한글 라벨).

### 공통
- 모든 페이지 상단에 공통 헤더/네비(로고 + 홈·아카이브·제보) 노출.

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

### P0 — 인증 경로 불일치 (치명)
- [ ] **A1** `apps/web/src/auth/api.ts`에서 `login` 요청 URL은 `/api/auth/login`이다(현재 `/api/admin/login`).
- [ ] **A2** `fetchMe`는 `/api/auth/me`, `logout`은 `/api/auth/logout`, `acceptInvite`는 `/api/auth/invites/:token/accept`를 호출한다.
- [ ] **A3** `fetchReports`/`fetchReport`/`submitVerification`/첨부 다운로드는 **계속** `/api/admin/*`를 호출한다(변경 없음).
- [ ] **A4** 모든 인증·관리 요청은 `credentials: "include"`를 유지한다.
- [ ] **A5** 통합: 유효한 자격으로 로그인 → `fetchMe`가 사용자 객체를 반환 → 큐 조회 성공 → `logout` 후 `fetchMe`가 null. (mock fetch가 `/api/auth/*` 경로로 호출되는지 단언.)

### P1 — 플로우
- [ ] **B1** Step5 "검토·제출" 요약은 제목·분류·지역·첨부에 더해 **본문·출처 URL·발생 시점·선거명**을 표시한다. 값 없으면 "없음"/"-" 표기.
- [ ] **B2** 선거는 ID가 아니라 **선거명**(`elections`에서 매칭)으로 표시한다.
- [ ] **C1** 제보 완료 화면에 다음 행동 링크 3개가 있다: 공개 아카이브(`/archive`), 홈(`/`), 추가 제보(`/report` 또는 마법사 초기화). 추가 제보 클릭 시 새 빈 마법사로 진입한다.
- [ ] **C2** "접수번호: {id}" 문구는 추적 불가를 오해하지 않도록 정정한다(예: "접수 식별자 — 현재 이 번호로 진행 상황을 조회하는 기능은 제공되지 않습니다").
- [ ] **D1** `auth/ReportDetailPage.tsx` 판정 폼에 **"확인되지 않은 주장(unverifiedClaims)" 텍스트 입력 필드**(`label` 연결)가 있다.
- [ ] **D2** `submitVerification` 호출 payload에 입력한 `unverifiedClaims`가 포함된다(빈 값이면 생략 또는 빈 문자열은 서버 계약대로 처리).
- [ ] **D3** `apps/web/src/auth/api.ts`의 `Verification`·`VerificationInput` 타입에 `unverifiedClaims`가 추가된다(서버 응답/요청 계약과 일치).
- [ ] **D4** 판정 폼 진입 시 근거 링크 입력 블록이 **기본 1개 펼쳐져** 있다(현재 0개).
- [ ] **E1** 아카이브 검색·필터 상호작용이 **한 방식으로 통일**된다(결정: 검색도 즉시 디바운스 — 설계 메모 참조). 검색어 타이핑 후 필터(지역/분류/선거)를 바꿔도 검색어가 유실되지 않는다.
- [ ] **E2** 검색 입력 변경 후 디바운스 시간(예: 300ms) 내 추가 입력 시 fetch가 1회로 합쳐진다(또는 채택 방식의 동등 단언).
- [ ] **F1** 마법사 Step5에서 동의 미체크로 제출 버튼이 비활성일 때, **비활성 사유 안내 텍스트**("제출하려면 동의가 필요합니다" 류)가 보인다.

### P2 — 표시/일관성
- [ ] **G1** 공통 날짜 포맷 유틸이 있고, 공개/관리 양쪽에서 ISO 원문 대신 사람이 읽는 형식(예: `2026-06-15 14:30` 또는 `2026년 6월 15일`)으로 표시한다. ISO 문자열(`T`, `Z` 포함 원문)이 화면에 노출되지 않는다.
- [ ] **G2** null/빈 시점은 포맷 유틸이 빈 문자열 또는 지정 대체 문자열을 반환한다(예외 던지지 않음).
- [ ] **H1** 출처 콘텐츠 해시는 축약(예: 앞 10자 + "…")으로 표시하고, 전체 값은 `title` 속성(툴팁)에 담는다. 공개·관리 공통.
- [ ] **I1** validity 값(`valid`/`partly`/`invalid`/`unclear`)이 한글 라벨로 표시된다(예: 확인됨/부분 확인/확인 안 됨/불명확). 공개 검토 요약·관리 폼 선택지 양쪽.
- [ ] **I2** severity 숫자(1~5)가 한글 라벨로 표시된다(라벨 매핑 표는 설계 메모에 고정). 공개·관리 공통.
- [ ] **J1** 공통 헤더/네비 컴포넌트가 존재하고 로고 + 홈/아카이브/제보 링크를 제공하며, 공개·관리 페이지에 적용된다.
- [ ] **J2** 홈(`App.tsx`)은 "Vite + React 스캐폴드" 문구 대신 실제 랜딩(프로젝트 소개 + 신뢰 메시지 + CTA 2개: 아카이브/제보)을 렌더한다.
- [ ] **K1** 관리 콘솔(`LoginPage`/`QueuePage`/`ReportDetailPage`)에서 하드코딩 색상값(`#b00020`, `#ddd`, `#555`, `#777`, `#a00`, `#0a0` 등)이 제거되고 0010 디자인 토큰(`var(--color-*)`)으로 대체된다.
- [ ] **L1** 공개 아카이브 첨부 다운로드 발급 실패 시(현재 무음), 사용자에게 **일반 오류 메시지**(존재 여부를 누설하지 않는 문구)가 노출된다. 성공 시 메시지 없음.
- [ ] **M1** 관리 검토 상세(`ReportDetailPage`)에 맥락이 표시된다: 지역, 분류, 발생 시점, 수집 시점, **기존 판정 이력**(`verificationHistory`)이 있으면 목록으로.

### 회귀 (절대 조건)
- [ ] **R1** 기존 0001~0010 테스트가 전부 그대로 통과한다.
- [ ] **R2** DOM 구조/`data-testid`/`aria-label` 변경은 최소화한다. 기존 테스트가 의존하는 셀렉터는 보존한다.
- [ ] **R3** `pnpm -r typecheck && pnpm -r build && pnpm -r test` 전부 통과.

## 테스트 계획 (TDD — Red 먼저)

### P0
- `apps/web/src/auth/api.test.ts` (신규): `global.fetch`를 mock하고 `login/fetchMe/logout/acceptInvite` 호출 시 첫 인자 URL이 `/api/auth/*`인지 단언. `fetchReports/fetchReport/submitVerification`은 `/api/admin/*`인지 단언. **이 테스트를 먼저 실패시키고**(현재 전부 `/api/admin`) api.ts 분리로 통과시킨다.
- `apps/web/src/auth/LoginPage.test.tsx` (기존 보강): 로그인 성공 경로가 `/api/auth/login` mock에 매칭되도록.

### P1
- `apps/web/src/report/ReportWizard.summary.test.tsx` (신규/보강): 본문·출처·발생시점·선거명이 Step5 요약에 렌더되는지(B1·B2).
- `apps/web/src/report/ReportWizard.done.test.tsx` (신규): 완료 화면에 아카이브/홈/추가제보 링크(C1), 접수번호 문구 정정(C2).
- `apps/web/src/report/ReportWizard.submit.test.tsx` (기존): 동의 게이트·제출 회귀 유지 + F1 비활성 사유 텍스트 단언 추가.
- `apps/web/src/auth/ReportDetailPage.test.tsx` (기존 보강): unverifiedClaims 입력 → submit payload 포함(D1·D2·D3), 근거 블록 기본 1개(D4), 맥락·이력 표시(M1).
- `apps/web/src/archive/ArchiveListPage.test.tsx` (기존 보강): 검색어 입력 후 필터 변경해도 검색어 유지(E1), 디바운스 합치기(E2).

### P2
- `apps/web/src/format.test.ts` (신규): 날짜 포맷 유틸 — ISO 입력→사람 형식, null→대체값(G1·G2). 해시 축약 유틸(H1). validity/severity 라벨 매핑(I1·I2).
- `apps/web/src/archive/ArchiveDetailPage.test.tsx` (기존 보강): 날짜 포맷, 해시 축약+title, validity/severity 한글 라벨, 다운로드 실패 메시지(L1).
- `apps/web/src/App.test.tsx` (기존 보강): 스캐폴드 문구 부재 + 소개/CTA 존재(J2).
- 공통 네비 컴포넌트 테스트(J1): 헤더 렌더 + 링크 3종.
- 관리 콘솔 토큰 테스트(K1): 하드코딩 hex가 렌더 결과/소스에 없음(스타일 단언 또는 토큰 사용 확인). 기존 `tokens.test.ts` 패턴 참고.

> Red 순서 권장: **P0 api.test 먼저**(가장 치명적, 가장 작음) → 통합 로그인 → P1 → P2.

## 설계 메모 (Design notes)

### P0 근본 원인
`apps/web/src/auth/api.ts` 최상단 `const base = "/api/admin";`가 인증(login/me/logout/invites)과 관리(reports/verification/download)에 **공유**된다. 서버는 `apps/api/src/app.ts`에서 `app.route("/api/auth", ...)`(인증)과 `app.route("/api/admin", ...)`(검토 콘솔, 내부 `requireReviewer` 보호)를 **분리** 마운트한다. 따라서 `/api/admin/login`은 인증 라우트에 존재하지 않고 requireReviewer에 막혀 401 → 로그인·세션·초대 전부 실패.

해결: api.ts에 **두 베이스**를 둔다.
- `AUTH_BASE = "/api/auth"` → login, fetchMe, logout, acceptInvite.
- `ADMIN_BASE = "/api/admin"` → fetchReports, fetchReport, submitVerification, 첨부 다운로드.

서버 변경 없음. 기존 서버 테스트 `app.mount.test.ts`가 두 경로 분리를 이미 보장한다.

### unverifiedClaims (D 항목)
서버는 이미 지원한다(`admin-routes.ts`의 `VerificationInput`·응답 graph, `db/verification.ts`, `schema.ts`). 공개 상세(`ArchiveDetailPage`)는 이미 `v.unverifiedClaims`를 렌더한다. **누락은 web 관리 측 한곳**: `auth/api.ts`의 `Verification`/`VerificationInput` 타입에 `unverifiedClaims` 없음 + 폼에 입력칸 없음. 타입 추가 + 폼 필드 + submit payload 연결만 하면 끝(서버 무변경).

### E1 검색/필터 통일 — 결정과 근거
**결정: 검색도 즉시 디바운스(300ms)로 통일**, "검색" 제출 버튼 제거(또는 즉시 적용 보조용으로만 유지).
- 근거: 현재 검색은 form submit, 필터는 onChange 즉시. 검색어를 `searchInput` 로컬 state에만 두고 query에 미반영하므로, 필터를 바꿔 query가 갱신되면 입력한 검색어가 결과에 반영되지 않아 "유실"처럼 보인다. 디바운스로 검색어를 query에 반영하면 검색·필터가 동일하게 query 단일 소스를 갱신 → 상태 일관.
- 대안(전체 "적용" 버튼): 명시적이지만 클릭 추가 필요. 데이터 서비스 톤에선 즉시 반영이 더 자연스럽다. 디바운스 채택.
- 테스트는 채택 방식(디바운스 1회 fetch 합치기)으로 단언. fake timer 사용.

### G1 날짜 포맷 유틸
신규 `apps/web/src/format.ts`에 `formatDateTime(iso: string | null): string` 등. 로캘 고정(ko-KR)로 SSR/CSR·테스트 결정성 확보(`Intl.DateTimeFormat` 또는 수동 포맷). 적용처: ArchiveList(`collectedAt`), ArchiveDetail(`occurredAt`/`collectedAt`/`capturedAt`/`reviewedAt`), QueuePage(`collectedAt`), ReportDetail(맥락·이력 시점).

### I1/I2 라벨 매핑(고정)
- validity: `valid`→"확인됨", `partly`→"부분 확인", `invalid`→"확인 안 됨", `unclear`→"불명확".
- severity: 1→"매우 낮음", 2→"낮음", 3→"보통", 4→"높음", 5→"매우 높음" (숫자 병기 가능: "보통(3)").
- 매핑은 `format.ts` 또는 별도 `labels.ts`에 단일 소스로 둔다. 공개·관리 공통 import.

### 스코프 결정 (되묻지 않음)
- **출처 다중 입력: 포함.** 마법사 Step4에서 출처 URL을 여러 개 입력 가능하게(추가/삭제). `createReport`는 이미 `sources: string[]`를 받는다. Step5 요약·B1에도 다중 출처 반영.
- **첨부 다중 업로드: 후속(별도 스펙).** 이번엔 단일 첨부 유지.
- **목록↔상세 필터 상태 보존: 포함(권장).** 아카이브 리스트 필터/검색/페이지를 쿼리스트링(`?q=&sido=&category=&electionId=&offset=`)에 동기화 → 상세 진입 후 뒤로가기 시 필터 유지. `react-router`의 `useSearchParams` 사용. (E1 디바운스와 함께 query 단일 소스로 통합.)

### 무결성 관련
표시 포맷·라벨링은 **표시 계층**만 바꾼다. 저장값(수집시점·스냅샷·해시·버전)은 원문 그대로 보존하며 화면에서만 가공(해시 전체는 title에 원문 유지). 데이터 변형 없음.

### DOM/testid 최소 변경 원칙
기존 테스트가 의존하는 라벨·`aria-label`(검색/지역/분류/선거 등)·`data-testid`(`evidence-link-{i}`)는 보존. 새 입력은 새 id/label로 추가하고 기존 셀렉터를 깨지 않는다.

## 권장 구현 순서
1. **P0 A1~A5** — api.ts 베이스 분리. 가장 치명적·최소 변경. 인증/큐/판정 전부 복구. (verify: 신규 api.test + 로그인 통합)
2. **D1~D4** — unverifiedClaims 타입/폼/근거 기본 1개. (verify: ReportDetailPage.test)
3. **B1·B2·C1·C2·F1** — 마법사 요약/완료/사유 안내. (verify: summary·done·submit 테스트)
4. **E1·E2 + 필터 쿼리스트링 보존** — 아카이브 검색/필터 통일. (verify: ArchiveListPage.test)
5. **G/H/I 유틸(format.ts·labels.ts)** → 적용. (verify: format.test + 상세/큐 보강)
6. **J1·J2** — 공통 네비 + 홈 랜딩. (verify: App.test + 네비 테스트)
7. **K1·L1·M1** — 관리 콘솔 토큰화 + 다운로드 실패 메시지 + 검토 상세 맥락/이력. (verify: 해당 테스트 보강)
8. **R1~R3 전체 회귀** — `pnpm -r typecheck && build && test` 그린 확인 후 in-review.

## Changelog
- 2026-06-15: 초안. 로컬 라이브 테스트(pglite) UX 풀리뷰 결과 P0(인증 경로 불일치)~P2(표시 일관성) 13항목 + 스코프 결정(출처 다중 포함/첨부 다중 후속/필터 쿼리스트링 보존) 정의.
