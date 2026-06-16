import { describe, it, expect } from "vitest";
import { loadRegionPolygons } from "./dataset.js";
import { reverseRegion } from "./reverse.js";

// 0021 번들된 실데이터(통계청 2018 시군구) 스모크. 알려진 좌표가 올바른 시군구로 매핑되는지.
describe("loadRegionPolygons — 실데이터(0021)", () => {
  const ds = loadRegionPolygons();

  it("250개 안팎의 시군구를 로드한다", () => {
    expect(ds.length).toBeGreaterThan(200);
  });

  it("알려진 좌표를 올바른 시도/시군구로 역지오코딩한다", () => {
    expect(reverseRegion(37.5735, 126.979, ds)).toEqual({
      sido: "서울특별시",
      sigungu: "종로구",
    });
    expect(reverseRegion(35.163, 129.163, ds)).toEqual({
      sido: "부산광역시",
      sigungu: "해운대구",
    });
    expect(reverseRegion(33.5, 126.53, ds)?.sido).toBe("제주특별자치도");
  });

  it("국토 밖(바다) 좌표는 null", () => {
    expect(reverseRegion(34.0, 128.0, ds)).toBeNull();
  });
});
