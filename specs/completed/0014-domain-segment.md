---
id: 0014
title: 도메인 세그먼트 (선거 의혹 / 집회 현장)
status: completed
owner: backend-dev + web-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0001, 0002, 0003, 0004, 0005]
blocks: [0016]
dev_order: 14   # 0013 다음. 0016(모자이크)이 domain=assembly 에 의존.
---

## 목표 (Goal)

현재 데이터 모델에는 **top-level 도메인 구분이 없다**. `category` 는 선거 관련 **세부 분류**(투개표/사전투표/…, 0007)일 뿐이다. 디자인/블루프린트는 서비스를 두 갈래(**선거 의혹** 아카이브와 **집회 현장** 신고)로 나누는 상단 세그먼트를 전제한다.

이 스펙은 report 에 `domain`(`election` | `assembly`, 기본 `election`) 컬럼을 추가하고, 제보폼·공개 아카이브·검수 큐 상단에 세그먼트 컨트롤을 두어 생성/필터/직렬화에 반영한다. 기존 category 는 `election` 도메인의 세부분류로 유지하고, `assembly` 용 분류는 최소만 둔다.

## 비목표 (Non-goals)

- 집회 도메인 전용 데이터 모델(주최/규모/경로 등) 신설 — MVP 는 `domain` 플래그 + 최소 분류까지. 집회 특화 필드는 후속 스펙.
- category 체계 재설계(0007 election 분류 불변). 본 스펙은 domain 축 **추가**만.
- 도메인별 권한 분리(집회 검수자 vs 선거 검수자) — 후속. 검수는 0004/0006 권한 그대로.
- 얼굴 모자이크/공개본 분리(→ 0016). 본 스펙은 domain 값을 만들어 0016 이 분기할 토대만 제공.

## 사용자 흐름 (User flow)

1. **제보폼(0003)**: 첫 단계에 상단 세그먼트(선거 의혹 / 집회 신고) → 선택값이 `domain` 으로 본문에 포함. election 선택 시 기존 category(0007) 노출, assembly 선택 시 최소 assembly 분류 노출.
2. **생성(0002)**: `POST /api/reports` 가 `domain` 을 받아 저장(미지정 시 `election` 기본). 허용 외 값은 400.
3. **공개 아카이브(0005)**: 리스트 상단 세그먼트 → `GET /api/reports?domain=election|assembly` 로 좁힘. 상세에 domain 노출.
4. **검수 큐(0004)**: 관리자 큐 상단에도 domain 세그먼트 → 도메인별 검수 분리 조회.

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

### 모델 / 마이그레이션
- [ ] `report` 에 `domain`(text, NOT NULL, default `election`) 컬럼이 추가되고 새 마이그레이션이 생성된다(기존 0001~0007 마이그레이션 불변).
- [ ] 기존 행은 마이그레이션 후 모두 `domain='election'` 이다(default 백필).
- [ ] domain 은 `{election, assembly}` 집합에 속할 때만 저장된다(앱 레벨 enum 검증, 0007 category 패턴과 동일).

### 생성 API (0002)
- [ ] `POST /api/reports` 가 `domain` 을 받아 저장한다. 미지정 시 `election` 으로 저장된다.
- [ ] 허용 외 domain 값(예: `protest`)은 **400** 과 `fields: { domain: "invalid" }` 반환.
- [ ] domain=assembly 일 때 category 는 assembly 분류 집합(결정 3)만 허용. election 분류를 assembly 로 보내면 400(또는 category 생략 허용 — 결정 2).

### 목록 / 상세 API (0002/0005)
- [ ] `GET /api/reports?domain=assembly` 는 verified 범위 내 assembly 항목만 반환하고 total 갱신. `domain=election` 동일.
- [ ] domain 미지정 쿼리는 **두 도메인 모두**(또는 election 기본 — 결정 4) 반환한다. 결정대로 일관 동작.
- [ ] 공개 상세 응답에 `domain` 이 포함된다. 민감 필드 누설은 기존대로 없음.

### web (0003/0005/0004)
- [ ] 제보폼 상단에 세그먼트가 렌더되고, 선택값이 생성 요청 본문 `domain` 으로 전송된다(모킹 페이로드 단언). assembly 선택 시 category 옵션이 assembly 분류로 바뀐다.
- [ ] 아카이브 리스트 상단 세그먼트 선택 시 `domain` 쿼리로 API 호출·결과 갱신.
- [ ] 검수 큐 상단 세그먼트 선택 시 domain 필터로 관리자 조회.

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`:
  - `reports.create.test.ts` 확장: domain 저장 / 미지정→election / 허용 외 400 / assembly+election분류 거부(또는 생략 허용).
  - `reports.read.test.ts` 확장: domain=assembly·election 필터 / 미지정 기본 동작.
  - `reports.public-contract.test.ts` 확장: 상세에 domain 직렬화, 민감 필드 미포함.
  - `migration.domain.test.ts`(또는 repository 테스트): 기존 행 domain 백필=election.
- `apps/web`:
  - `ReportWizard.domain.test.tsx`: 세그먼트 렌더·domain 전송·assembly 시 category 전환.
  - `archive.domain.test.tsx`(0005): 세그먼트 선택→domain 쿼리 호출.
  - 검수 큐 domain 필터 테스트(0004 콘솔).
- 먼저 **실패하는** 테스트 작성 후 구현.

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행 — 보수적 기본값)

1. **domain = text + 앱 레벨 enum + NOT NULL default `election`**. 근거: 0007 category 가 같은 패턴(text+앱검증). NOT NULL+default 로 기존 행 백필이 자동, 모든 제보가 항상 한 도메인에 속함(누락 상태 없음). DB enum 타입은 마이그레이션 부담으로 미채택.
2. **assembly category 미선택 허용**(category nullable 유지, 0007 결정 2 일관). assembly 분류를 정확히 모를 수 있으므로 강요 아님. 단 **election 전용 분류값을 assembly 에 붙이면 400**(도메인-분류 정합성 검증).
3. **assembly 분류 집합(최소, MVP)**: `집회·시위 | 충돌·물리력 | 채증·촬영 | 기타`. 서버 단일 상수로 정의(election 분류와 분리된 배열). 도메인에 따라 허용 집합이 갈린다.
4. **domain 미지정 공개 쿼리 = 두 도메인 모두 반환**. 근거: 아카이브 기본은 전체 노출, 세그먼트는 좁히는 용도. (election 기본으로 숨기면 assembly 제보가 기본 화면에서 안 보여 혼란.) 단 web 기본 진입 화면은 세그먼트 기본값을 election 으로 둘 수 있음(표시 기본 ≠ API 기본).

### 데이터 무결성
- domain 은 현재 값 필드. report 수정 시 0001 report_history 스냅샷에 포함되어 직전 도메인 보존(별도 처리 불필요).
- domain 은 발급 후 사실상 불변(제보 성격 자체) — 검수자 보정 외 변경 없음.

### 0007/0016 정렬
- 0007 category 검증을 domain 인지(domain-aware)로 확장: `isReportCategory(domain, category)`. election 집합(0007)·assembly 집합(결정 3) 분기.
- 0016(모자이크)은 `domain=assembly` 일 때만 얼굴 모자이크 공개본을 생성 → 본 스펙이 그 분기 키를 제공.

### 회귀 (절대 조건)
- 기존 0001~0012 테스트 전부 통과. domain default=election 백필로 기존 제보·필터·직렬화가 깨지지 않아야 한다.

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
- 2026-06-15: 서버(backend-dev): report.domain(election|assembly, default election) + 마이그레이션 0007, 도메인별 분류 검증(불일치 400 양방향), 목록/검수 ?domain 필터(AND·미지정=둘다), 직렬화, assembly 시드. web(frontend-dev): DomainSegment 컴포넌트, 마법사·아카이브·검수 큐 세그먼트 + 도메인별 분류 전환. QA PASS(web↔서버 값 일치, 양방향 정합, 마이그레이션 정합). 게이트 (api 158 + web 136), 회귀 0. status→completed.
