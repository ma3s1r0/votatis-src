---
id: 0021
title: EXIF GPS → 시군구 자동 입력 (오프라인 폴리곤 역지오코딩)
status: completed
owner: backend-dev + frontend-dev
created: 2026-06-16
updated: 2026-06-16
depends_on: [0015, 0019]
---

## 목표 (Goal)
제보 첨부 사진의 EXIF GPS 좌표를 읽어, 해당 위치의 **시도·시군구**를 자동으로 채워
제보 입력을 줄인다. 외부 API 키 없이 **오프라인 폴리곤 매칭**(point-in-polygon)으로
좌표→행정구역을 결정한다(구성 ②). 자동값은 제안일 뿐, 제보자가 수정할 수 있다.

## 비목표 (Non-goals)
- 읍면동(동 단위) 자동 결정 — 경계 데이터 정밀도/용량 부담. 1차는 시군구까지.
- 외부 역지오코딩 API(VWorld/Kakao) 연동(구성 ①) — 이번 범위 아님.
- GPS 없는 사진 보정/추정 — GPS 있을 때만 동작.
- EXIF GPS를 신뢰의 근거로 삼는 것 — 조작 가능. 어디까지나 입력 편의 + 출처 표기.

## 사용자 흐름 (User flow)
1. 제보 폼(0019)에서 사진 첨부 → 클라이언트가 EXIF에서 GPS(위도/경도) 추출.
2. GPS 있으면 `POST /api/geocode/reverse {lat,lng}` 호출 → `{sido, sigungu}` 수신.
3. 위치 입력칸(시도/시군구)이 비어 있으면 자동 채움 + "사진 위치에서 자동 입력됨(수정 가능)" 표시.
   이미 사용자가 입력했으면 덮어쓰지 않는다(수동 우선).
4. 제출 시 자동입력 여부를 출처로 기록(무결성).

## 수용 기준 (Acceptance criteria — 테스트 가능하게)
- [x] `parseExifTiff`/`extractGps` — GPS IFD(0x8825)의 위도/경도(+Ref N/S/E/W)를 십진 좌표로 반환.
      GPS 없으면 `null`. → `apps/web/src/report/exif.gps.test.ts`
- [x] `reverseRegion(lat,lng,dataset)` — point-in-polygon(구멍 제외) → `{sido,sigungu}`,
      미매칭/빈 데이터셋 → `null`. → `apps/api/src/geocode/reverse.test.ts`
- [x] `POST /api/geocode/reverse {lat,lng}` → 200 `{region}`(미매칭 null), 범위초과 400.
      → `apps/api/src/geocode-routes.test.ts`
- [x] 클라: GPS 있는 사진 첨부 시 빈 위치를 시군구로 자동 채움, 기존 입력은 유지(덮지 않음).
      → `apps/web/src/report/ReportWizard.geofill.test.tsx`
- [x] 클라: GPS 없거나 역지오코딩 실패 시 자동입력 없이 조용히 진행(에러 노출 안 함).
- [x] **데이터셋**: 통계청(KOSTAT) 2018 시군구 경계(southkorea-maps) → DP(≈130m) 단순화 +
      4자리 반올림으로 18MB→0.82MB, 250개 `RegionPolygon[]`(`sigungu.json`) 번들. 시도명은
      코드 2자리 prefix → 정본 시도명. → `apps/api/src/geocode/dataset.test.ts`(종로/해운대/제주 검증).
- [x] 무결성: 자동입력 위치 `locationSource: "exif-gps"` 기록(수동과 구분). report 스키마 확장
      (drizzle 0011) + 서버 권위(허용값만 저장) + 어드민 상세 표식.
      → `apps/api/src/reports.create.test.ts`, `ReportWizard.geofill.test.tsx`
- [x] 회귀: 자동입력은 0015 EXIF 차단 판정과 독립(차단 파일은 추가 안 되므로 GPS 미사용).

## 테스트 계획 (TDD — Red 먼저)
- `apps/web/src/report/exif.gps.test.ts` — extractGps: GPS IFD 파싱(위도/경도/Ref, 분·초 RATIONAL), 미포함→null.
- `apps/api/src/geocode/reverse.test.ts` — reverseRegion: 픽스처 정사각형 폴리곤으로 내부/외부/경계.
- `apps/api/src/geocode.route.test.ts` — /api/geocode/reverse: 정상/범위초과 400/미매칭.
- `apps/web` ReportWizard 통합: GPS 사진 → 시군구 자동, 기존 입력 보존.
- 먼저 실패 테스트 작성 후 최소 구현.

## 설계 메모 (Design notes)
- **데이터 의존성(핵심)**: 시군구 경계 GeoJSON이 레포에 없다. 공개 행정구역 경계(예:
  행정안전부/통계청 SGIS, 또는 공개 simplified GeoJSON)를 **단순화(simplify)** 해 용량을
  줄여 **API Lambda 에 번들**한다(웹 번들 비대화 방지 — 그래서 매칭은 서버에서). 좌표만
  클라→서버로 전송. 데이터 출처·버전·수집시점을 기록(무결성 원칙).
  - 미해결: 데이터 소스 확정 + 라이선스 + 단순화 허용 오차(시군구 경계는 1차 매칭엔
    수백 m 오차 허용 가능). 용량 목표 < ~2MB(gzip).
- **EXIF GPS 파싱**: 0015 `exif.ts` 의 `parseTiff` 에 GPS IFD(IFD0 태그 0x8825) 스캔 추가.
  GPSLatitude(0x0002)/GPSLongitude(0x0004)는 3개 RATIONAL(도/분/초), Ref(0x0001/0x0003)는
  N/S·E/W. JPEG 한정(현 파서 범위). PNG/WebP는 미지원(폴백).
- **point-in-polygon**: ray-casting. 시군구가 멀티폴리곤이라 각 ring 처리. 성능: 후보를
  bounding box 로 먼저 거른 뒤 정밀 판정.
- **프라이버시**: GPS는 민감정보. 자동입력은 시군구까지만(정확 좌표는 저장/표시 안 함).
  EXIF 원본 GPS를 서버에 영구 저장하지 않는다(역지오코딩 입력으로만 사용).
- **무결성**: 자동입력 위치는 수동과 구분(locationSource). 제보자가 항상 수정 가능.

## Changelog
- 2026-06-16: 스펙 작성. 구성 ②(오프라인 폴리곤·서버 매칭) 채택.
- 2026-06-16: 머신러리 구현(EXIF GPS 파싱·point-in-polygon·/api/geocode/reverse·클라 자동입력) TDD 완료.
- 2026-06-16: 통계청 2018 시군구 경계 공개데이터를 단순화(0.82MB)해 번들·탑재 → 자동입력 end-to-end
  동작. locationSource(출처 마킹)만 후속 증분으로 분리하고 본 스펙은 in-review.
- 2026-06-16: locationSource(0011 마이그레이션) 추가·라이브 검증(생성 저장·어드민 노출·허용외 null) → completed.
