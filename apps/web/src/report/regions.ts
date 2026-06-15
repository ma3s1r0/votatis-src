// 전국 행정구역 데이터(시도 → 시군구 → 읍면동).
// 원본: Votatis/Votatis apps/frontend/src/data/regions.nested.json.
import data from "./regions.nested.json";

type Umd = { name: string; code: string };
type SigunguNode = { name: string; code: string; umd: Umd[] };
type SidoNode = { sido: string; code: string; sigungu: SigunguNode[] };

const regions = data as SidoNode[];

export const sidoList: string[] = regions.map((s) => s.sido);

export function sigunguList(sido: string): string[] {
  const s = regions.find((r) => r.sido === sido);
  return s ? s.sigungu.map((g) => g.name) : [];
}

export function eupMyeonDongList(sido: string, sigungu: string): string[] {
  const s = regions.find((r) => r.sido === sido);
  const g = s?.sigungu.find((x) => x.name === sigungu);
  return g ? g.umd.map((u) => u.name) : [];
}
