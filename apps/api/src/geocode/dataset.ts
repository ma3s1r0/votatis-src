import type { RegionPolygon } from "./reverse.js";
import sigungu from "./sigungu.json" with { type: "json" };

// 0021 시군구 경계 데이터셋 로더.
// 데이터: 통계청(KOSTAT) 2018 행정구역(시군구) 경계 — 공개 데이터.
//   출처 southkorea-maps(skorea-municipalities-2018) GeoJSON 을 Douglas-Peucker(≈130m)
//   단순화 + 좌표 4자리 반올림으로 18MB→~0.8MB 축소, RegionPolygon[] 로 변환(scripts 참고).
//   시도명은 코드 2자리 prefix → 정본 시도명 매핑(regions 와 일치).
// 무결성: 원본 출처/연도/변환 방식을 여기 명시. 자동입력은 "제안"이며 제보자가 수정 가능.
export function loadRegionPolygons(): RegionPolygon[] {
  return sigungu as RegionPolygon[];
}
