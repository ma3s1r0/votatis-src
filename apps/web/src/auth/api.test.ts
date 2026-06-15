import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  login,
  fetchMe,
  logout,
  acceptInvite,
  fetchReports,
  fetchReport,
  submitVerification,
} from "./api";

function lastUrl(): string {
  const f = fetch as ReturnType<typeof vi.fn>;
  return String(f.mock.calls[f.mock.calls.length - 1][0]);
}
function lastInit(): RequestInit {
  const f = fetch as ReturnType<typeof vi.fn>;
  return f.mock.calls[f.mock.calls.length - 1][1] as RequestInit;
}

describe("auth/api 경로 분리 (P0)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login 은 /api/auth/login 을 호출한다", async () => {
    await login("a@b.com", "pw");
    expect(lastUrl()).toBe("/api/auth/login");
    expect(lastInit().credentials).toBe("include");
  });

  it("fetchMe 는 /api/auth/me 를 호출한다", async () => {
    await fetchMe();
    expect(lastUrl()).toBe("/api/auth/me");
    expect(lastInit().credentials).toBe("include");
  });

  it("logout 은 /api/auth/logout 을 호출한다", async () => {
    await logout();
    expect(lastUrl()).toBe("/api/auth/logout");
    expect(lastInit().credentials).toBe("include");
  });

  it("acceptInvite 는 /api/auth/invites/:token/accept 를 호출한다", async () => {
    await acceptInvite("tok1", "pw");
    expect(lastUrl()).toBe("/api/auth/invites/tok1/accept");
    expect(lastInit().credentials).toBe("include");
  });

  it("fetchReports 는 /api/admin/reports 를 호출한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], limit: 20, offset: 0 }), {
        status: 200,
      }),
    );
    await fetchReports();
    expect(lastUrl()).toContain("/api/admin/reports");
    expect(lastInit().credentials).toBe("include");
  });

  it("fetchReport 는 /api/admin/reports/:id 를 호출한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );
    await fetchReport("r1");
    expect(lastUrl()).toBe("/api/admin/reports/r1");
    expect(lastInit().credentials).toBe("include");
  });

  it("submitVerification 은 /api/admin/reports/:id/verification 을 호출한다", async () => {
    await submitVerification("r1", {
      verified: true,
      method: "교차 확인",
      evidenceLinks: [],
    });
    expect(lastUrl()).toBe("/api/admin/reports/r1/verification");
    expect(lastInit().credentials).toBe("include");
  });
});
