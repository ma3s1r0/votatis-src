import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  disableUser,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { createInvite } from "./db/auth.js";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

function postVerification(app: typeof ctx.app, id: string, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.request(`/api/admin/reports/${id}/verification`, {
    method: "POST",
    headers,
    body: JSON.stringify(validVerificationBody()),
  });
}

describe("0004 검토 콘솔 인증 게이트", () => {
  it("미인증으로 검토 큐 접근 → 401", async () => {
    const res = await ctx.app.request("/api/admin/reports");
    expect(res.status).toBe(401);
  });

  it("미인증으로 판정 작성 → 401", async () => {
    const r = await makeReport(ctx.db);
    const res = await postVerification(ctx.app, r.id);
    expect(res.status).toBe(401);
  });

  it("비active(invited) 세션 → 403", async () => {
    const { user } = await createInvite(ctx.db, "pending@votatis.test", "reviewer");
    const { adminSession } = await import("./db/schema.js");
    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await ctx.db.insert(adminSession).values({
      adminUserId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const res = await ctx.app.request("/api/admin/reports", {
      headers: { cookie: `votatis_session=${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("active reviewer 는 검토 큐 통과", async () => {
    const cookie = await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    const res = await ctx.app.request("/api/admin/reports", {
      headers: { cookie: cookie! },
    });
    expect(res.status).toBe(200);
  });

  it("disable 된 계정의 기존 세션으로 접근 차단(403)", async () => {
    const cookie = await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD);
    // 로그인 직후엔 통과.
    const before = await ctx.app.request("/api/admin/reports", {
      headers: { cookie: cookie! },
    });
    expect(before.status).toBe(200);

    // 계정 disable 후 동일 세션 → 403.
    await disableUser(ctx.db, ctx.reviewer.id);
    const after = await ctx.app.request("/api/admin/reports", {
      headers: { cookie: cookie! },
    });
    expect(after.status).toBe(403);

    // 판정 작성도 차단.
    const r = await makeReport(ctx.db);
    const post = await postVerification(ctx.app, r.id, cookie!);
    expect(post.status).toBe(403);
  });
});
