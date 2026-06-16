// 관리자 인증 API 클라이언트. 서버 계약은 specs/0006-auth.md 참고.
// 모든 요청은 동일 오리진, httpOnly 세션 쿠키 사용 → credentials: "include".

// 서버는 인증(login/me/logout/invites)을 /api/auth, 검토 콘솔(reports/verification)을
// /api/admin 에 분리 마운트한다. 두 베이스를 따로 둔다.
const AUTH_BASE = "/api/auth";
const ADMIN_BASE = "/api/admin";

export type AdminMe = {
  id: string;
  email: string;
  role: "root" | "reviewer";
  status: "invited" | "active" | "disabled";
};

export type LoginResult =
  | { ok: true }
  | { ok: false; error: "invalid_credentials" | "rate_limited" | "unknown" };

export async function login(
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${AUTH_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, error: "invalid_credentials" };
  if (res.status === 429) return { ok: false, error: "rate_limited" };
  return { ok: false, error: "unknown" };
}

export async function fetchMe(): Promise<AdminMe | null> {
  const res = await fetch(`${AUTH_BASE}/me`, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as AdminMe;
}

export async function logout(): Promise<void> {
  await fetch(`${AUTH_BASE}/logout`, { method: "POST", credentials: "include" });
}

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: "expired" | "invalid" | "unknown" };

export async function acceptInvite(
  token: string,
  password: string,
): Promise<AcceptResult> {
  const res = await fetch(
    `${AUTH_BASE}/invites/${encodeURIComponent(token)}/accept`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    },
  );
  if (res.ok) return { ok: true };
  if (res.status === 410) return { ok: false, error: "expired" };
  if (res.status === 400) return { ok: false, error: "invalid" };
  return { ok: false, error: "unknown" };
}

// ── 0004 라벨링·검증 콘솔 ───────────────────────────────────────────────

export type AdminReport = {
  id: string;
  title: string;
  body: string;
  status: string;
  sido: string | null;
  sigungu: string | null;
  eupMyeonDong: string | null;
  // 0021: 위치 출처. "exif-gps"=사진 GPS 자동입력 / null=수동.
  locationSource?: string | null;
  occurredAt: string | null;
  collectedAt: string | null;
  verified: boolean;
  domain?: string;
  // 검수 단계: pending=대기(0동의) / reviewing=검증중(1/2) / done=처리(2/2).
  stage?: "pending" | "reviewing" | "done";
  // 첫 이미지 첨부 썸네일(단기 presigned URL). 없으면 미첨부/비이미지.
  thumbnailUrl?: string;
};

export type QueueStats = { pending: number; reviewing: number; done: number };

export type Attachment = {
  id: string;
  filename: string | null;
  mime?: string | null;
  size?: number | null;
  status?: string;
  // stored 첨부만 단기 presigned URL 동봉(없으면 미저장).
  url?: string;
};

export type Source = {
  id: string;
  url: string;
  capturedAt: string | null;
  contentHash: string | null;
  archiveUrl: string | null;
};

export type EvidenceLink = {
  url: string;
  capturedAt: string;
  contentHash: string;
  archiveUrl?: string;
};

export type Verification = {
  confidence: number | null;
  validity: string | null;
  severity: string | null;
  legalIssue: boolean | null;
  verified: boolean;
  method: string;
  notes: string | null;
  unverifiedClaims: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
};

// 판정 이력 항목(서버: admin-routes.ts `verificationHistory`). 과거 판정 스냅샷.
export type VerificationHistoryEntry = {
  version: number;
  archivedAt: string | null;
  snapshot: Record<string, unknown>;
};

// 0017 2인 교차검증 진행도. 서버 상세 응답 최상위에 포함.
export type CrossVerification = {
  approvals: number;
  required: number;
  approvers: string[];
};

export type AdminReportDetail = AdminReport & {
  attachments: Attachment[];
  sources: Source[];
  verification: Verification | null;
  verificationHistory: VerificationHistoryEntry[];
  crossVerification?: CrossVerification;
};

export async function fetchReports(
  limit = 20,
  offset = 0,
  domain?: string,
  stage?: "pending" | "reviewing" | "done",
): Promise<{
  items: AdminReport[];
  stats?: QueueStats;
  limit: number;
  offset: number;
}> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (domain) params.set("domain", domain);
  if (stage) params.set("stage", stage);
  const res = await fetch(`${ADMIN_BASE}/reports?${params.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`reports_fetch_failed:${res.status}`);
  return (await res.json()) as {
    items: AdminReport[];
    stats?: QueueStats;
    limit: number;
    offset: number;
  };
}

export async function fetchReport(id: string): Promise<AdminReportDetail> {
  const res = await fetch(`${ADMIN_BASE}/reports/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`report_fetch_failed:${res.status}`);
  return (await res.json()) as AdminReportDetail;
}

export type VerificationInput = {
  confidence?: number;
  validity?: string;
  severity?: string;
  legalIssue?: boolean;
  verified: boolean;
  method: string;
  notes?: string;
  unverifiedClaims?: string;
  evidenceLinks: EvidenceLink[];
};

export type FieldError = { field: string; reason: string };

export type SubmitVerificationResult =
  // 0017: 동의 성공 시 갱신된 진행도(approvals/required)를 함께 반환.
  | { ok: true; approvals?: number; required?: number }
  | { ok: false; error: "already_approved" }
  | { ok: false; error: "validation_error"; fields: FieldError[] }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "unknown" };

export async function submitVerification(
  id: string,
  input: VerificationInput,
): Promise<SubmitVerificationResult> {
  const res = await fetch(
    `${ADMIN_BASE}/reports/${encodeURIComponent(id)}/verification`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    },
  );
  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      approvals?: number;
      required?: number;
    };
    return { ok: true, approvals: data.approvals, required: data.required };
  }
  // 0017: 동일 reviewer 재동의 → 409 already_approved.
  if (res.status === 409) return { ok: false, error: "already_approved" };
  if (res.status === 422) {
    const data = (await res.json()) as {
      error: string;
      fields?: FieldError[];
    };
    return {
      ok: false,
      error: "validation_error",
      fields: data.fields ?? [],
    };
  }
  if (res.status === 404) return { ok: false, error: "not_found" };
  return { ok: false, error: "unknown" };
}
