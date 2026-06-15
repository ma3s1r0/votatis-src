import { describe, it, expect } from "vitest";
import { SIDO_COORDS, sidoCoord } from "./sido-coords";

// 17개 시도 정적 좌표 상수(스펙 0018 결정 1). 실 타일/지오코딩 없음 — SVG 분포용.
describe("sido-coords", () => {
  it("17개 시도 키를 가진다", () => {
    expect(Object.keys(SIDO_COORDS)).toHaveLength(17);
  });

  it("좌표 키에 중복이 없다", () => {
    const keys = Object.keys(SIDO_COORDS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("아카이브 시도 필터 옵션을 모두 포함한다", () => {
    for (const s of [
      "서울특별시",
      "부산광역시",
      "대구광역시",
      "인천광역시",
      "광주광역시",
      "대전광역시",
      "울산광역시",
      "세종특별자치시",
      "경기도",
      "강원특별자치도",
      "충청북도",
      "충청남도",
      "전북특별자치도",
      "전라남도",
      "경상북도",
      "경상남도",
      "제주특별자치도",
    ]) {
      expect(SIDO_COORDS[s]).toBeDefined();
    }
  });

  it("모든 좌표가 SVG viewBox(0..100) 범위 내에 있다", () => {
    for (const { x, y } of Object.values(SIDO_COORDS)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
  });

  it("좌표가 없는 sido(또는 null)는 null을 반환한다", () => {
    expect(sidoCoord("없는도")).toBeNull();
    expect(sidoCoord(null)).toBeNull();
  });
});
