import { describe, it, expect, beforeEach } from "vitest";
import { setup, jsonReq } from "./auth.test-helpers.js";
import { createInvite } from "./db/auth.js";
import { adminUser, adminInvite } from "./db/schema.js";
import { eq } from "drizzle-orm";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

describe("초대 수락", () => {
  // 수용 기준: 유효 토큰+비번 accept → active, 비밀번호는 해시로만 저장(평문 미포함).
  it("정상 accept → status=active, 비밀번호는 해시로 저장(평문 아님)", async () => {
    const { user, token } = await createInvite(ctx.db, "a@votatis.test", "reviewer");
    const password = "my-secret-pw-987";
    const res = await ctx.app.request(`/invites/${token}/accept`, jsonReq({ password }));
    expect(res.status).toBe(200);

    const [u] = await ctx.db.select().from(adminUser).where(eq(adminUser.id, user.id));
    expect(u.status).toBe("active");
    expect(u.passwordHash).toBeTruthy();
    // 평문 미포함 + 단방향 해시 형식(argon2id).
    expect(u.passwordHash).not.toContain(password);
    expect(u.passwordHash!.startsWith("$argon2")).toBe(true);
  });

  // 수용 기준: 토큰 일회용 — 재사용 거부(410), status 변하지 않음.
  it("이미 소비된 토큰 재사용 → 410, status 불변", async () => {
    const { token } = await createInvite(ctx.db, "b@votatis.test", "reviewer");
    await ctx.app.request(`/invites/${token}/accept`, jsonReq({ password: "pw-1111" }));
    const res = await ctx.app.request(`/invites/${token}/accept`, jsonReq({ password: "pw-2222" }));
    expect(res.status).toBe(410);
  });

  // 수용 기준: 만료된 토큰 → 거부(410), status 불변.
  it("만료된 토큰 → 410, status 불변", async () => {
    const { user, token } = await createInvite(ctx.db, "c@votatis.test", "reviewer");
    // 만료 강제
    await ctx.db
      .update(adminInvite)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(adminInvite.adminUserId, user.id));
    const res = await ctx.app.request(`/invites/${token}/accept`, jsonReq({ password: "pw-3333" }));
    expect(res.status).toBe(410);
    const [u] = await ctx.db.select().from(adminUser).where(eq(adminUser.id, user.id));
    expect(u.status).toBe("invited");
  });

  // 수용 기준: 존재하지 않는 토큰 → 거부(400).
  it("존재하지 않는 토큰 → 400", async () => {
    const res = await ctx.app.request(`/invites/deadbeef/accept`, jsonReq({ password: "pw-4444" }));
    expect(res.status).toBe(400);
  });
});
