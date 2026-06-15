// 관리자 인증 API 클라이언트. 서버 계약은 specs/0006-auth.md 참고.
// 모든 요청은 동일 오리진, httpOnly 세션 쿠키 사용 → credentials: "include".

const base = "/api/admin";

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
  const res = await fetch(`${base}/login`, {
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
  const res = await fetch(`${base}/me`, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as AdminMe;
}

export async function logout(): Promise<void> {
  await fetch(`${base}/logout`, { method: "POST", credentials: "include" });
}

export type AcceptResult =
  | { ok: true }
  | { ok: false; error: "expired" | "invalid" | "unknown" };

export async function acceptInvite(
  token: string,
  password: string,
): Promise<AcceptResult> {
  const res = await fetch(
    `${base}/invites/${encodeURIComponent(token)}/accept`,
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
  occurredAt: string | null;
  collectedAt: string | null;
  verified: boolean;
};

export type Attachment = {
  id: string;
  filename: string;
  url: string;
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
  severity: number | null;
  legalIssue: boolean | null;
  verified: boolean;
  method: string;
  notes: string | null;
  reviewer: string | null;
  reviewedAt: string | null;
};

export type AdminReportDetail = AdminReport & {
  attachments: Attachment[];
  sources: Source[];
  verification: Verification | null;
  verificationHistory: Verification[];
};

export async function fetchReports(
  limit = 20,
  offset = 0,
): Promise<{ items: AdminReport[]; limit: number; offset: number }> {
  const res = await fetch(
    `${base}/reports?limit=${limit}&offset=${offset}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`reports_fetch_failed:${res.status}`);
  return (await res.json()) as {
    items: AdminReport[];
    limit: number;
    offset: number;
  };
}

export async function fetchReport(id: string): Promise<AdminReportDetail> {
  const res = await fetch(`${base}/reports/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`report_fetch_failed:${res.status}`);
  return (await res.json()) as AdminReportDetail;
}

export type VerificationInput = {
  confidence?: number;
  validity?: string;
  severity?: number;
  legalIssue?: boolean;
  verified: boolean;
  method: string;
  notes?: string;
  evidenceLinks: EvidenceLink[];
};

export type FieldError = { field: string; reason: string };

export type SubmitVerificationResult =
  | { ok: true }
  | { ok: false; error: "validation_error"; fields: FieldError[] }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "unknown" };

export async function submitVerification(
  id: string,
  input: VerificationInput,
): Promise<SubmitVerificationResult> {
  const res = await fetch(
    `${base}/reports/${encodeURIComponent(id)}/verification`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    },
  );
  if (res.ok) return { ok: true };
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
