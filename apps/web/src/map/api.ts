// 지도 집계 API 클라이언트(스펙 0018). 서버 계약:
//   GET /api/map-stats?domain= → { items: [{ sido, total, byStatus: { verified, reviewing, unverified } }] }
// 카운트만 반환(좌표 없음). 좌표는 web 정적 상수(sido-coords.ts)에서 매핑한다.
// 공개 가시성 규칙(0002)을 서버가 보장 — 본문·식별정보는 미포함, 숫자만.

import type { ReportDomain } from "../categories";

export type MapStatusCounts = {
  verified: number;
  reviewing: number;
  unverified: number;
};

export type MapStatItem = {
  sido: string | null;
  total: number;
  byStatus: MapStatusCounts;
};

export type MapStatsResponse = { items: MapStatItem[] };

export async function fetchMapStats(
  domain?: ReportDomain | null,
): Promise<MapStatItem[]> {
  const params = new URLSearchParams();
  if (domain) params.set("domain", domain);
  const qs = params.toString();
  const res = await fetch(`/api/map-stats${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`map_stats_fetch_failed:${res.status}`);
  const json = (await res.json()) as MapStatsResponse;
  return json.items;
}
