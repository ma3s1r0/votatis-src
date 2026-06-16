import { describe, it, expect } from "vitest";
import { reverseRegion, type RegionPolygon } from "./reverse.js";

// 픽스처: 두 정사각형 시군구 + 구멍 있는 한 개.
// 좌표는 [lng,lat]. A=[0..2]×[0..2], B=[10..12]×[10..12], C(구멍) 외곽[20..26]×[20..26], 구멍[22..24]×[22..24].
const dataset: RegionPolygon[] = [
  {
    sido: "가도",
    sigungu: "A시",
    bbox: [0, 0, 2, 2],
    polygons: [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]],
  },
  {
    sido: "나도",
    sigungu: "B시",
    bbox: [10, 10, 12, 12],
    polygons: [[[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]]],
  },
  {
    sido: "다도",
    sigungu: "C시(구멍)",
    bbox: [20, 20, 26, 26],
    polygons: [
      [
        [[20, 20], [26, 20], [26, 26], [20, 26], [20, 20]],
        [[22, 22], [24, 22], [24, 24], [22, 24], [22, 22]],
      ],
    ],
  },
];

describe("reverseRegion — point-in-polygon(0021)", () => {
  it("폴리곤 내부 좌표는 해당 시군구를 반환한다", () => {
    // reverseRegion(lat, lng): A 내부 (lng=1, lat=1)
    expect(reverseRegion(1, 1, dataset)).toEqual({ sido: "가도", sigungu: "A시" });
    expect(reverseRegion(11, 11, dataset)).toEqual({ sido: "나도", sigungu: "B시" });
  });

  it("모든 폴리곤 밖이면 null", () => {
    expect(reverseRegion(5, 5, dataset)).toBeNull(); // 어느 bbox 에도 안 듦
    expect(reverseRegion(50, 50, dataset)).toBeNull();
  });

  it("구멍(hole) 안의 좌표는 제외되어 null", () => {
    // C 외곽 안이지만 구멍(22..24) 안 → 제외
    expect(reverseRegion(23, 23, dataset)).toBeNull();
    // C 외곽 안 + 구멍 밖 → C시
    expect(reverseRegion(21, 21, dataset)).toEqual({
      sido: "다도",
      sigungu: "C시(구멍)",
    });
  });

  it("빈 데이터셋이면 항상 null(데이터 미탑재 graceful)", () => {
    expect(reverseRegion(1, 1, [])).toBeNull();
  });
});
