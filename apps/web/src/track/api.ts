// 공개 상태조회 API 클라이언트(스펙 0013). 인증 없음·동일 오리진.
// 서버 계약: GET /api/track/:number → { trackingNumber, currentStage, publicUrl, timeline }.
// 없는/형식오류 번호 404, rate limit 429. 민감정보 없음(타임라인 단계만).

const base = "/api";

export type TrackingStage = "received" | "reviewing" | "verified" | "published";
export type TimelineState = "done" | "current" | "upcoming";

export type TimelineStep = {
  stage: TrackingStage;
  label: string;
  state: TimelineState;
};

export type TrackingStatus = {
  trackingNumber: string;
  currentStage: TrackingStage;
  publicUrl: string | null;
  timeline: TimelineStep[];
};

export type FetchTrackingResult =
  | { ok: true; status: TrackingStatus }
  | { ok: false; error: "not_found" | "rate_limited" | "unknown" };

export async function fetchTrackingStatus(
  trackingNumber: string,
): Promise<FetchTrackingResult> {
  const res = await fetch(
    `${base}/track/${encodeURIComponent(trackingNumber)}`,
  );
  if (res.ok) {
    return { ok: true, status: (await res.json()) as TrackingStatus };
  }
  if (res.status === 404) return { ok: false, error: "not_found" };
  if (res.status === 429) return { ok: false, error: "rate_limited" };
  return { ok: false, error: "unknown" };
}
