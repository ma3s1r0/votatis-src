// 지역 정적 데이터셋 (MVP 샘플). 실제 전체 행정구역은 후속 작업에서 교체.
// 구조: 시도 → 시군구 → 읍면동.

export type RegionTree = Record<string, Record<string, string[]>>;

export const regions: RegionTree = {
  서울특별시: {
    강남구: ["역삼동", "삼성동", "대치동"],
    종로구: ["청운효자동", "사직동", "삼청동"],
  },
  부산광역시: {
    해운대구: ["우동", "중동", "좌동"],
    수영구: ["광안동", "남천동"],
  },
  경기도: {
    수원시: ["팔달구", "영통구", "장안구"],
    성남시: ["분당동", "수정동"],
  },
};

export const sidoList = Object.keys(regions);

export function sigunguList(sido: string): string[] {
  return sido && regions[sido] ? Object.keys(regions[sido]) : [];
}

export function eupMyeonDongList(sido: string, sigungu: string): string[] {
  return sido && sigungu && regions[sido]?.[sigungu] ? regions[sido][sigungu] : [];
}
