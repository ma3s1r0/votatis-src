// 0013 상태 타임라인 — 내부 status → 공개 4단계 매핑(서버 단일 상수).
// 0001 status enum 변경 시 이 파일 한 곳만 갱신한다.

export const TRACKING_STAGES = ["received", "reviewing", "verified", "published"] as const;
export type TrackingStage = (typeof TRACKING_STAGES)[number];

const STAGE_LABEL: Record<TrackingStage, string> = {
  received: "접수됨",
  reviewing: "검수중",
  verified: "검증완료",
  published: "공개",
};

// 내부 status → 공개 단계(결정 3). 미지 status 는 received 폴백.
const STATUS_TO_STAGE: Record<string, TrackingStage> = {
  submitted: "received",
  pending: "received",
  unverified: "received",
  reviewing: "reviewing",
  confirmed: "verified",
  verified: "verified",
};

// 현재 단계 결정: verified=true 면 항상 published. 아니면 status 매핑(미지→received).
export function currentStage(input: { status: string; vVerified: boolean | null }): TrackingStage {
  if (input.vVerified === true) return "published";
  return STATUS_TO_STAGE[input.status] ?? "received";
}

// 타임라인 직렬화: 4단계 고정 + 현재 단계까지 done/현재 current/이후 upcoming.
export function buildTimeline(stage: TrackingStage) {
  const idx = TRACKING_STAGES.indexOf(stage);
  return TRACKING_STAGES.map((s, i) => ({
    stage: s,
    label: STAGE_LABEL[s],
    state: i < idx ? "done" : i === idx ? "current" : "upcoming",
  }));
}
