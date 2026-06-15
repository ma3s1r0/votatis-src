---
id: 0016
title: 모자이크 / 원본분리 포렌식 (공표 처리)
status: completed
owner: backend-dev
created: 2026-06-15
updated: 2026-06-15
depends_on: [0001, 0002, 0004, 0008, 0014]
blocks: []
dev_order: 16   # 0014(domain) 이후. assembly 도메인 분기에 의존.
---

## 목표 (Goal)

집회(assembly, 0014) 제보의 첨부에는 일반 시민의 얼굴이 담길 수 있다. 공표(공개) 승인 시 **원본은 R2/S3 에 보존**(관리자·소송용)하고, **공개에는 얼굴 모자이크 처리된 공개본만** 노출하도록 스토리지 키와 접근 경로를 분리한다. 즉, 외부 공개 경로는 `public/` 객체만 반환하고, `original/` 은 인증된 관리자만 접근한다.

이 스펙은 **인터페이스·분리 저장·공개 경로 게이트**까지 정의한다. 실 이미지 모자이크 처리(얼굴 검출/블러)는 인프라(추론 파이프라인) 의존이라 **비목표**로 두고, 모자이크 단계를 호출하는 자리(포트)와 분리 저장·공개 게이트만 단위검증 가능한 형태로 만든다.

## 비목표 (Non-goals)

- **실 얼굴 검출/블러 처리 알고리즘·모델 배선** — 인프라(추론/람다/큐) 의존. 본 스펙은 `MosaicPort` 인터페이스와 호출 지점, 결과(public 키) 저장까지. 실제 픽셀 처리 구현은 후속 인프라 스펙.
- election 도메인 제보의 모자이크 — 집회(assembly)만 대상(결정 1). election 첨부는 기존 0008 다운로드 그대로.
- 동영상 모자이크 — 이미지만.
- 모자이크 강도/영역 수동 편집 UI — 후속. MVP 는 자동 처리 결과를 public 으로 둠.
- 공개본 CDN 서명/캐시 정책 — 0008/0009 경로 재사용. 본 스펙은 어떤 키를 public 으로 노출할지의 게이트.

## 사용자 흐름 (User flow)

1. 검수자(0004)가 assembly 제보를 **공표(공개) 승인**(verified=true 확정, 0017 의 2인 충족 후).
2. 공표 처리 트리거 → 각 stored 첨부에 대해 `MosaicPort.process({ originalKey })` 호출 → 모자이크된 객체를 `public/` 키로 저장하고, attachment 에 `publicKey` 기록(원본 `original/` 키는 그대로 보존).
3. **공개 다운로드(0008 경로)**: 외부(비관리자) 요청은 assembly 첨부에 대해 **`publicKey`(모자이크본) 의 presigned GET 만** 반환. publicKey 가 아직 없으면(처리 전) 404.
4. **관리자 다운로드**: 인증된 reviewer 는 `original/` 원본에 접근 가능(소송·검증용 별도 admin 경로).

## 수용 기준 (Acceptance criteria — 테스트 가능하게)

### 모델 / 스토리지 키 분리
- [ ] attachment 에 `publicKey`(text, nullable) 컬럼이 추가되고 새 마이그레이션 생성(기존 마이그레이션 불변). 기존 `storageKey` 는 원본(`original/...`) 키로 유지.
- [ ] 신규 attachment 의 원본 스토리지 키가 `original/` prefix 아래 생성된다(공개본은 `public/` prefix). 두 prefix 가 코드 상수로 분리된다.
- [ ] `MosaicPort` 인터페이스가 정의된다: `process({ originalKey }) → { publicKey }`. 테스트용 `FakeMosaic`(원본을 그대로 public 키로 복사 시뮬레이션) 더블 존재.

### 공표 처리
- [ ] assembly 제보 공표 승인 시 각 stored 첨부에 대해 `MosaicPort.process` 가 호출되고 결과 `publicKey` 가 attachment 에 저장된다(FakeMosaic 로 단위검증).
- [ ] election 제보 공표 시에는 모자이크 처리가 호출되지 **않는다**(domain 분기 — 결정 1).
- [ ] 공표 처리는 멱등하다 — 이미 publicKey 가 있는 첨부를 재처리해도 중복 객체/오류 없이 안전(또는 명시적 skip).

### 공개 경로 게이트 (0008)
- [ ] assembly 첨부의 **공개 다운로드**(비관리자, 0008 `/download`)는 `publicKey` 의 presigned GET 만 반환하고, `original/` 키나 storageKey 를 응답에 노출하지 않는다.
- [ ] publicKey 가 아직 없는(미처리) assembly 첨부의 공개 다운로드는 **404**(원본 누설 금지).
- [ ] election 첨부의 공개 다운로드는 기존 0008 동작(storageKey presigned GET) 그대로다(회귀 0).
- [ ] 직렬화 계약: 외부 공개 응답 어디에도 `original/` 키·원본 storageKey 가 나타나지 않는다(테스트 단언).

## 테스트 계획 (TDD — Red 먼저)

- `apps/api`:
  - `mosaic.process.test.ts`: assembly 공표→MosaicPort.process 호출·publicKey 저장(FakeMosaic) / election→미호출 / 멱등 재처리.
  - `mosaic.download-gate.test.ts`: assembly 공개 다운로드는 publicKey 만·original 키 미노출 / publicKey 없으면 404 / election 은 0008 그대로.
  - `mosaic.public-contract.test.ts`: 외부 응답에 original/ 키·storageKey 미포함 단언.
  - 스토리지 키 prefix(original/ vs public/) 생성 단위 테스트.
- 먼저 **실패하는** 테스트 작성 후 구현. 실 모자이크 픽셀 처리는 FakeMosaic 로 대체(인프라 비목표 경계).

## 설계 메모 (Design notes)

### 결정 / 근거 (자율 진행 — 보수적 기본값)

1. **모자이크 대상 = domain=assembly 만**(0014 의존). 근거: 얼굴 노출 위험은 집회 채증 사진에 집중. election 첨부(투개표 자료 등)는 인물 비중이 낮고 모자이크가 증거가치를 훼손할 수 있어 제외. domain 으로 분기.
2. **원본 보존 + 공개본 분리**(결정·요청 명시). `original/` = 관리자·소송용 영구 보존(절대 외부 미노출). `public/` = 모자이크본, 외부 노출 유일 경로. 한 attachment 가 두 객체(원본+공개본)를 가짐.
3. **실 모자이크는 인터페이스로 격리(비목표 경계)**. `MosaicPort.process` 만 정의하고, 본 스펙 구현은 FakeMosaic(원본→public 키 복사) 로 게이트·분리·멱등을 단위검증. 실 얼굴검출/블러는 0009 류 인프라 후속 스펙에서 S3Storage 처럼 실 구현체 주입(StoragePort 패턴 재사용).
4. **공개 게이트 단일 지점**(0008 패턴). 0008 의 `getStoredAttachmentForVerifiedReport` 게이트에 domain 분기 추가: assembly → publicKey 필수(없으면 404), 그 외 → storageKey. 외부 응답은 URL·만료만(기존 0008 결정 — storageKey 비노출 유지·강화).
5. **멱등성**: 공표가 재호출되거나 재검증으로 다시 트리거될 수 있으므로, publicKey 존재 시 skip. 처리 실패 시 publicKey 미설정→공개 404 유지(부분 공개 누설 방지, fail-closed).

### 데이터 무결성
- 원본은 절대 변경/삭제하지 않음(소송 증거 보존). 공개본은 원본에서 파생 — 원본 sha256(0002)은 그대로 무결성 기록.
- publicKey 추가도 report_history/attachment 변경 이력 패턴과 충돌 없음(attachment 는 append 성격, publicKey 는 1회 설정 후 불변).

### 회귀 (절대 조건)
- 기존 0001~0012 테스트 전부 통과. **election 첨부 다운로드(0008)는 동작 불변** — assembly 분기만 추가. storageKey 컬럼·기존 키 경로 깨지지 않아야 한다.

## Changelog
- 2026-06-15: 초안 작성 (planner). status=not-started.
- 2026-06-15: 구현(backend-dev): MosaicPort+FakeMosaic, attachment.public_key(마이그레이션 drizzle idx 8 — 순번일 뿐 스펙0008과 무관), original/·public/ 키 분리, 공표(verified=true) 시 assembly 첨부 모자이크 트리거(election no-op), 공개 다운로드 public만·미처리 404(fail-closed)·원본 미노출, 멱등. 실 얼굴검출/블러는 비목표(인터페이스+Fake). QA PASS(원본 누설·fail-closed·키추측 차단 검증). 게이트 (api 175 + web 158), 회귀 0. status→completed.
- 2026-06-15: ⚠️ **배포 책임(비목표 경계)**: `createApp`이 mosaic 미주입 시 FakeMosaic(원본→public 키 복사)로 폴백 → **운영 배포 전 실 MosaicPort(얼굴검출/블러) 주입 필수**. 0009 배선 후속에 포함.
