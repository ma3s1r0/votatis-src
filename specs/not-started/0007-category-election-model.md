---
id: 0007
title: 분류·선거 모델 확장 + 공개 필터 복원
status: not-started
owner: backend-dev + web-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0001, 0002, 0003, 0005]
blocks: []
dev_order: 7   # 0008과 독립이라 병렬 가능.
---

## 목표 (Goal)

현재 `report` 모델에는 **분류(category)** 컬럼과 **선거(election) 직접 링크**가 없다. category 는 `event` 에만 있고, 선거는 `event.election_id` 경유로만 연결된다. 그래서 0005 공개 아카이브에서 **category·election 필터가 MVP 제외**되었다(0005 스코프 결정 참고: "report 모델에 category 컬럼·election 직접 링크가 없어 서버가 못 거름").

이 스펙은 `report` 에 분류·선거 연결을 추가하고, 그 위에 0002 생성/조회 API·0003 입력 마법사·0005 공개 아카이브의 필터를 **복원**한다. 결과: 사용자가 카테고리·선거로 검증 통과분을 좁혀 탐색할 수 있다.

## 비목표 (Non-goals)

- event 단위 분류 체계 재설계(event.category 는 그대로 둔다). 본 스펙은 **report 레벨** 분류·선거 연결에 한정.
- region(지역) 정규화 — 0001 결정대로 컬럼 임베드 유지. 지역 필터는 이미 `sido` 로 동작(0005).
- 전용 검색엔진·패싯 집계(카테고리별 개수 사전 계산 등) — 후속. 본 스펙은 단순 WHERE 필터.
- 라벨링 콘솔(0004)에서 category 편집 UI — 본 스펙은 제보 생성 경로의 category 저장까지. 검토자 수정은 후속(필요 시 별도 스펙).
- election 마스터 데이터 관리 화면(선거 CRUD UI) — 후속. 본 스펙은 기존 election 행을 **선택**해 연결만.

## 사용자 흐름 (User flow)

1. **제보 생성(0002/0003)**: 입력 마법사 Step 2 분류에서 category(고정 enum)와 election(선택) 선택 → `POST /api/reports` 본문에 `category`·`electionId` 포함 → report 행에 저장.
2. **공개 목록(0002/0005)**: `GET /api/reports?category=…&electionId=…` → verified 범위 내에서 category·election 으로 좁혀진 결과·개수 반환.
3. **공개 상세(0002/0005)**: 상세 응답에 category·election(이름) 표기 → 아카이브 상세 화면에 노출.
4. **아카이브 필터(0005)**: 카테고리 드롭다운·선거 드롭다운 추가 → 선택 시 목록 갱신, 기존 검색(q)·지역(sido) 필터와 조합 동작.

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

### 모델 / 마이그레이션
- [ ] `report` 에 `category`(text, nullable) 와 `election_id`(uuid, nullable, `election.id` FK) 컬럼이 추가되고, 새 마이그레이션이 생성된다(기존 0001~0004 마이그레이션 불변).
- [ ] category 는 고정 enum 집합에 속할 때만 저장된다(아래 결정 1). 집합 외 값은 생성 API에서 **400**.
- [ ] 존재하지 않는 `election_id` 로 생성 시 FK 위반 500 대신 **400**(검증 후 거부).

### 생성 API (0002)
- [ ] `POST /api/reports` 가 `category`·`electionId` 를 받아 저장하고, 누락 시에도 생성은 성공한다(둘 다 선택 필드 — 결정 2).
- [ ] 허용 외 category 값은 **400** 과 어떤 필드가 문제인지 반환.

### 목록/상세 API (0002)
- [ ] `GET /api/reports?category=X` 는 verified 범위 내 category=X 인 항목만 반환하고 `total` 을 갱신한다.
- [ ] `GET /api/reports?electionId=Y` 는 verified 범위 내 해당 선거 항목만 반환한다.
- [ ] category·election·q·sido 필터를 **조합**하면 AND 로 좁혀진다.
- [ ] 공개 상세(`GET /api/reports/:id`) 응답에 `category` 와 `election`(id+name, 없으면 null)이 포함된다. 민감 필드(submitter 등) 누설은 기존대로 없음.

### 마법사 (0003)
- [ ] Step 2 분류에서 category 선택 UI(고정 enum)와 election 선택 UI가 렌더되고, 제출 시 본문에 `category`·`electionId` 가 전송된다(모킹으로 요청 페이로드 단언).
- [ ] category 미선택도 제출 가능(선택 필드).

### 아카이브 (0005)
- [ ] 아카이브 리스트에 카테고리·선거 필터 컨트롤이 렌더되고, 선택 시 해당 쿼리 파라미터로 API를 호출한다(모킹).
- [ ] 필터 조합 적용 시 결과·개수가 갱신되고, 미검증 누설은 여전히 없다(API 권위 위임 유지).

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`:
  - `reports.create.test.ts` 확장: category 저장 / 허용 외 category 400 / 없는 electionId 400 / 둘 다 누락 성공.
  - `reports.read.test.ts` 확장: category 필터 / election 필터 / q+sido+category 조합 / 상세에 category·election 직렬화.
  - `reports.public-contract.test.ts` 확장: 공개 직렬화에 category·election 포함, 민감 필드 미포함.
- `apps/web`:
  - `ReportWizard.submit.test.tsx`(또는 신규 `ReportWizard.category.test.tsx`): category·electionId 전송 페이로드 단언, 미선택 제출.
  - `archive.filter.test.tsx`(0005): 카테고리/선거 필터 컨트롤 렌더·쿼리 파라미터 호출·결과 갱신.
- 먼저 **실패하는** 테스트를 작성한 뒤 구현.

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행 — 보수적 기본값)

1. **category = text + 앱 레벨 enum 검증**(DB enum 타입 아님). 근거: 0001 이 event.category 도 text 로 두었고(방언 마이그레이션 단순), 집합 변경 시 마이그레이션 부담 회피. **기본 enum 집합**(MVP, 변경 가능):
   `투개표 | 사전투표 | 전산집계 | 개표참관 | 명부·선거인 | 시스템·장비 | 기타`
   서버에 단일 상수 배열로 정의해 생성·필터·UI(웹은 API 또는 공유 상수에서 동일 목록 사용)가 같은 출처를 본다.
2. **category·election 모두 선택(nullable) 필드**. 근거: 제보자가 분류·선거를 항상 정확히 안다고 가정하지 않는다(0003 톤: 강요 아닌 기록 유도). 미분류 제보도 접수 가능. 검토자가 후속으로 보정(향후).
3. **선거 연결 = report.election_id 직접 컬럼**(event 경유 아님). 근거: report 는 0001~0003 에서 event 없이도 생성된다(eventId nullable, 마법사는 event 를 만들지 않음). event 경유만 두면 모든 제보 필터가 event 의존이 되어 현 데이터 흐름과 불일치. 직접 컬럼이 단순하고 필터가 곧바로 동작.
4. **상세의 election 표기 = id + name**. report.election_id 로 election 행을 조회해 name 동봉(getReportGraph 는 이미 election 조회 경로가 있으나 event 경유 — report.election_id 우선으로 보강).

### 데이터 무결성
- category·election 은 **현재 값** 필드다. report 수정 시 0001 패턴대로 직전 상태가 `report_history` 스냅샷에 그대로 보존되므로 별도 이력 처리 불필요(updateReport 가 전체 행을 스냅샷).
- election 마스터가 바뀌어도(이름 변경 등) report.election_id 는 FK 로 안정 참조. 선거명 변천 이력은 본 스펙 범위 밖.

### 0002/0005 계약 정렬 메모
- 0002 `GET /api/reports` 의 기존 파라미터(`limit/offset/q/sido`)에 `category`·`electionId` 만 추가. `listVerifiedReports` 시그니처 확장.
- 0005 아카이브의 0005 스코프 결정("category·election 필터는 MVP 제외")을 본 스펙이 **해제**한다. 0005 본문 갱신은 불필요(완료 스펙 불변), 본 스펙이 후속으로 복원 책임.

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
