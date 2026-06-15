---
id: 0001
title: 데이터 모델 & 사건 스키마 (무결성 포함)
status: not-started
owner: planner
created: 2026-06-15
updated: 2026-06-15
---

## 목표 (Goal)

Votatis의 토대가 되는 **사건 단위 데이터 모델**과 **데이터 무결성(수집 시점·원본 스냅샷·변경 이력·버전)** 을 정의한다. 이후 모든 스펙(제보 수집·라벨링·공개 출력)이 이 스키마 위에 올라간다.

핵심 요구: 선관위 등 외부 원본은 시간이 지나면 바뀐다. 그래서 "지금 값"이 아니라 **"우리가 언제 수집한, 어떤 원본"** 인지가 항상 남아야 한다.

## 비목표 (Non-goals)

- 제보 수집/업로드 API 구현 (→ 0002)
- 라벨링·검증 콘솔 로직 (→ 0004). 단, 검증 결과를 담을 자리는 모델에 예약한다.
- 공개 조회 API/화면 (→ 0005)
- AWS 인프라 프로비저닝(RDS 생성 등 IaC)

## 사용자 흐름 (데이터가 시스템을 통과하는 흐름)

1. 시민/검증팀이 **제보(report)** 를 올린다 → 어떤 **사건(event)** 에 속하고, 어떤 **선거(election)** ·**지역(region)** 인지 연결.
2. 제보에는 **첨부(attachment)** 와 **출처(source)** 가 붙는다. 출처는 수집 시점의 **스냅샷**(원문/해시/아카이브 URL)으로 보존.
3. 검증팀이 제보를 검토해 **검증/라벨(verification)** 을 단다(0004). 라벨이 바뀌어도 이전 상태는 이력으로 남는다.
4. 검증 통과분만 공개로 노출(0005).

## 제안 엔티티 (정규화 모델 — 확정은 아래 "열린 결정" 참고)

- **election** — 선거. `id, name, type(지선/총선/대선/재보궐), held_on, …`
- **region** — 지역. `sido, sigungu, eup_myeon_dong` (정규화 또는 report에 임베드)
- **event** — 사건. `id, election_id, region_*, title, summary, category, occurred_at`
- **report** — 제보. `id, event_id?, title, body, occurred_at, collected_at(필수), status, submitter(익명 해시), consent, license`
- **attachment** — 첨부. `id, report_id, storage_key(S3), sha256, mime, size, exif?`
- **source** — 출처/근거. `id, (report_id|event_id), kind(url|text), url?, captured_at, content_hash, archive_url?, snapshot_ref`
- **verification** — 검증 결과(0004에서 채움). `report_id, reviewer, method, reviewed_at, confidence, validity, severity, legal_issue, verified, notes` — 자리만 예약

## 무결성 / 버전 (이 스펙의 핵심)

- 모든 외부 **source** 는 `captured_at` + `content_hash` + (가능 시) `archive_url`/원문 스냅샷을 보관한다.
- 레코드 **변경 이력 보존**: report/verification 수정 시 이전 상태가 사라지지 않는다(이력 테이블 또는 append-only 버전). 이전 버전 조회 가능해야 함.

## 수용 기준 (테스트 가능)

- [ ] election/region/event/report/attachment/source 엔티티와 마이그레이션이 생성된다.
- [ ] `report.collected_at` 은 필수이며 생성 시 기록된다.
- [ ] `source` 는 `captured_at` + `content_hash` 를 필수로 가진다(외부 URL 출처일 때 archive_url 보관 가능).
- [ ] report(또는 verification)를 수정하면 **이전 버전이 보존**되고 이력으로 조회된다(파괴적 업데이트 금지).
- [ ] verification 필드(confidence/validity/severity/legal_issue/verified)가 모델에 존재한다(값은 0004에서 채움, 여기선 nullable).
- [ ] 위 불변식을 검증하는 데이터 액세스 계층 테스트가 vitest로 작성·통과한다.

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`에 데이터 액세스 계층 + vitest 통합 테스트.
- 테스트 DB: **pglite**(인메모리 Postgres) 권장 — RDS(Postgres)와 동일 방언, 외부 의존 없이 CI 가능. (대안: sqlite, 단 방언 차이 주의)
- 케이스: ①report 생성 시 collected_at 자동 기록 ②source без captured_at/hash → 거부 ③report 수정 → 이전 버전 이력에 남음 ④사건-제보-첨부-출처 관계 조회.

## 설계 메모 / 열린 결정 (구현 전 합의 필요)

1. **모델 정규화 수준** — 회의록은 다중 엔티티(Election/Event/Location/Report/Attachment/Article), 구 레포(CF/D1)는 단일 flatten `reports` 테이블. RDS(Postgres)는 관계형이 자연스러우니 **정규화 권장**. 어디까지 쪼갤지(예: region 테이블 분리 vs 임베드) 확정 필요.
2. **ORM** — drizzle-orm(Postgres) 권장(구 레포 연속성, 마이그레이션·타입 안전). 확정 필요.
3. **버전 보존 방식** — (a) 별도 `*_history` 이력 테이블 vs (b) append-only 버전 행(version 컬럼). 권장: 감사 친화적인 이력 테이블.
4. **선관위 원천 데이터**는 별도 분석 레포(private-apis)에 있음 — 본 모델은 "제보/사건" 중심. 분석 산출물을 source/event로 들여올 인터페이스는 후속 스펙.

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
