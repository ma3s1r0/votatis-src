import type { RegionPolygon } from "./reverse.js";

// 0021 시군구 경계 데이터셋 로더.
// 현재 미탑재 → [] (역지오코딩은 항상 null, graceful). 자동입력 기능은 데이터 탑재 후 동작.
//
// 데이터 탑재 방법(추후):
//  - 공개 행정구역 경계(예: SGIS/통계청) GeoJSON 을 단순화해 RegionPolygon[] 로 변환,
//    `apps/api/src/geocode/sigungu.json` 으로 저장 후 아래를 `import data from "./sigungu.json"`
//    로 교체(esbuild 가 번들에 포함). 출처·버전·수집시점·라이선스를 함께 기록(무결성 원칙).
let cache: RegionPolygon[] | null = null;

export function loadRegionPolygons(): RegionPolygon[] {
  if (cache) return cache;
  cache = [];
  return cache;
}
