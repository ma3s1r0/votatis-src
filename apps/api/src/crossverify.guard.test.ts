import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { createInvite } from "./db/auth.js";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

function approve(id: string, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return ctx.app.request(`/api/admin/reports/${id}/verification`, {
    method: "POST",
    headers,
    body: JSON.stringify(validVerificationBody({ verified: true })),
  });
}

describe("0017 동의 게이트 — 비인증/비reviewer 401/403(0006)", () => {
  it("미인증 동의 → 401", async () => {
    const r = await makeReport(ctx.db);
    const res = await approve(r.id);
    expect(res.status).toBe(401);
  });

  it("비active(invited) 세션 동의 → 403", async () => {
    const { user } = await createInvite(ctx.db, "pending2@votatis.test", "reviewer");
    const { adminSession } = await import("./db/schema.js");
    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await ctx.db.insert(adminSession).values({
      adminUserId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const r = await makeReport(ctx.db);
    const res = await approve(r.id, `votatis_session=${token}`);
    expect(res.status).toBe(403);
  });

  it("active reviewer 동의 → 201", async () => {
    const cookie = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
    const r = await makeReport(ctx.db);
    const res = await approve(r.id, cookie);
    expect(res.status).toBe(201);
  });
});
