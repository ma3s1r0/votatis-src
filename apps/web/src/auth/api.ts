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
