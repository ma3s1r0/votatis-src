---
id: 0017
title: 2인 교차검증 (서로 다른 reviewer 2인 동의로 verified 확정)
status: not-started
owner: backend-dev + web-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0001, 0004, 0006]
blocks: []
dev_order: 17   # 0016 다음. 0004 검증 모델 위에.
---

## 목표 (Goal)

현재 검증(0004)은 **단일 reviewer** 가 verified=true 를 확정할 수 있다. 신뢰도를 높이기 위해, verified=true 확정에는 **서로 다른 reviewer 2인의 동의**가 필요하도록 한다(1/2 → 2/2). 동의를 누적하고, 동일인의 중복 동의를 거부하며, 2인 충족 시에만 verified 가 true 로 확정된다. 모든 동의·확정은 verification 이력(0001 패턴)에 보존되고, 관리 UI 에 "교차검증 N/2" 진행도가 표시된다.

## 비목표 (Non-goals)

- 3인 이상 N-of-M 일반화 — MVP 는 고정 2인. 임계값 설정 UI 비목표.
- 도메인/심각도별 가변 검증 인원(예: 고심각 3인) — 후속. 본 스펙은 일률 2인.
- 반대(거부) 투표·이의제기 워크플로 — 본 스펙은 "동의" 누적만. verified 취소·하향은 기존 0004 수정(이력 보존) 경로.
- 익명 교차검증(누가 동의했는지 숨김) — reviewer 신원은 내부 기록(공개엔 미노출, 0004 직렬화 그대로).

## 사용자 흐름 (User flow)

1. reviewer A 가 제보 판정(0004) 작성/검토 후 **검증 동의**(approve) → 동의 1/2 기록. 이 시점 verified 는 아직 **false**.
2. reviewer B(≠A) 가 같은 제보에 동의 → 2/2 충족 → verified=true 확정. 직후 0002/0005 공개 노출.
3. 같은 reviewer A 가 또 동의 시도 → **거부**(중복). 진행도 1/2 유지.
4. 관리 UI 검토 큐·상세에 "교차검증 N/2" 진행도와 동의자(내부) 표시. 2/2 면 "검증 완료".

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

- [ ] verified=true 는 **서로 다른 reviewer 2인의 동의**가 누적될 때만 확정된다. 1인 동의 상태에서는 verified=false 이며 공개(0002/0005)에 노출되지 않는다.
- [ ] **동일 reviewer 의 중복 동의는 거부**된다(409 또는 멱등 무시 — 결정 3). 진행도가 2/2 로 올라가지 않는다.
- [ ] 2번째(다른) reviewer 동의 시 verified=true 로 전환되고, 그 순간 0002/0005 공개 조회에 노출된다(통합 확인).
- [ ] 각 동의는 reviewer·시각이 기록되고, verified 확정은 0001 verification_history 패턴으로 이력에 남는다(누가 1차/2차 동의했는지 추적 가능).
- [ ] 비인증/비active/비reviewer 의 동의 시도는 0006 게이트로 **401/403**.
- [ ] 동의에도 근거 강제(0004 결정 1)가 유지된다 — method/evidence 없는 판정 위 동의는 거부(또는 동의 전 판정 존재 필수).
- [ ] 관리 API/상세 응답에 동의 진행도(`approvals`, `required: 2`, `verified`)가 포함되어 UI 가 "N/2" 를 렌더한다.

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`:
  - `crossverify.flow.test.ts`: A 동의→1/2·verified=false / B 동의→2/2·verified=true·공개 노출(통합) .
  - `crossverify.duplicate.test.ts`: A 재동의 거부·진행도 불변.
  - `crossverify.guard.test.ts`: 비인증/비reviewer 동의 401/403(0006).
  - `crossverify.history.test.ts`: 동의·확정 이력 보존(reviewer·시각).
  - `crossverify.evidence.test.ts`: 근거 없는 상태의 동의 거부.
- `apps/web`(콘솔, 0004):
  - `Review.crossverify.test.tsx`: "교차검증 N/2" 진행도 렌더 / 동의 버튼 / 본인 재동의 비활성·중복 거부 메시지 / 2/2 시 "검증 완료" 표시.
- 먼저 **실패하는** 테스트 작성 후 구현.

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행 — 보수적 기본값)

1. **임계값 = 고정 2인(서로 다른 reviewer)**(요청 명시). 서버 상수 `REQUIRED_APPROVALS = 2`. 가변화는 후속.
2. **동의 저장 = verification_approval 조인 테이블**(verification_id, reviewer_id, approved_at, **unique(verification_id, reviewer_id)**). 근거: 누가·언제 동의했는지 무결성 기록 + DB 유니크로 중복 동의를 구조적으로 차단(앱 검증 + DB 안전망). 0004 verification 본행은 그대로, 동의는 별도 행으로 누적.
3. **중복 동의 = 거부(409)**. 멱등 무시(200)보다 명시적 거부가 UI 에서 "이미 동의함"을 분명히 함. (단 동일 결과면 어느 쪽도 안전 — 진행도 불변이 핵심. 구현은 409 채택.)
4. **verified 확정 시점 = 2번째 동의 트랜잭션 내**. 동의 INSERT 와 동시에 `count(approvals) >= 2` 면 verification.verified=true 갱신 + verification_history append(원자적). 경합(동시 2번째 동의)도 트랜잭션·유니크로 일관.
5. **root reviewer 도 1인으로 카운트** — root 의 단독 2회는 결정 2 유니크로 불가(동일 reviewer). 서로 다른 신원 2명 필수.
6. **0004 단일 판정과의 정렬**: 기존 0004 는 verified 를 판정 작성 시 직접 셋했다. 본 스펙 적용 후 verified 확정은 **동의 경로로만** 일어난다(판정 작성은 내용만, verified 는 2/2 게이트). 0004 의 verified 직접 셋 경로는 동의 모델로 대체 — 0004 완료 스펙은 불변, 본 스펙이 후속으로 확정 규칙을 강화(0004 테스트는 동의 헬퍼로 2/2 충족시켜 verified 기대를 유지하도록 회귀 보강).

### 데이터 무결성
- 모든 동의는 reviewer·시각 기록(append-only). verified 확정은 이력 보존. 근거 source(0004)는 그대로 무결성 동반.

### 회귀 (절대 조건)
- 기존 0001~0012 테스트 전부 통과. 특히 0004 의 "verified→공개 노출" 통합 테스트는 **2인 동의로 verified 를 만드는 헬퍼**로 보강해 그린 유지(verified 직접 셋이 막혀도 기대 결과 동일). 공개 직렬화 계약 불변.

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
