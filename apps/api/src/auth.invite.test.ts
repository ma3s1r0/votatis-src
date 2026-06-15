import { describe, it, expect, beforeEach } from "vitest";
import { setup, loginCookie, jsonReq, ROOT_EMAIL, ROOT_PASSWORD } from "./auth.test-helpers.js";
import { createInvite, acceptInvite } from "./db/auth.js";
import { adminUser } from "./db/schema.js";
import { eq } from "drizzle-orm";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

describe("초대 발급 (root 전용)", () => {
  // 수용 기준: self-가입 엔드포인트 없음 (가입 라우트 부재).
  it("공개 self-가입 엔드포인트가 없다 (register 404)", async () => {
    const res = await ctx.app.request("/register", jsonReq({ email: "x@y.z", password: "p" }));
    expect(res.status).toBe(404);
  });

  // 수용 기준: 비인증 초대 시도 → 401.
  it("비인증 초대 발급 시도 → 401", async () => {
    const res = await ctx.app.request("/invites", jsonReq({ email: "new@votatis.test" }));
    expect(res.status).toBe(401);
  });

  // 수용 기준: 비-root(reviewer) 초대 시도 → 403.
  it("reviewer 가 초대 발급 시도 → 403", async () => {
    // reviewer 계정 생성·활성화
    const { token } = await createInvite(ctx.db, "rev@votatis.test", "reviewer");
    await acceptInvite(ctx.db, token, "reviewer-pw-123");
    const cookie = await loginCookie(ctx.app, "rev@votatis.test", "reviewer-pw-123");
    expect(cookie).not.toBeNull();

    const res = await ctx.app.request("/invites", {
      ...jsonReq({ email: "new@votatis.test" }),
      headers: { "content-type": "application/json", cookie: cookie! },
    });
    expect(res.status).toBe(403);
  });

  // 수용 기준: root 초대 시 invited 사용자 + 토큰 + 초대 URL 반환.
  it("root 가 초대 시 invited 사용자와 초대 URL 을 반환한다", async () => {
    const cookie = await loginCookie(ctx.app, ROOT_EMAIL, ROOT_PASSWORD);
    const res = await ctx.app.request("/invites", {
      ...jsonReq({ email: "new@votatis.test" }),
      headers: { "content-type": "application/json", cookie: cookie! },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { email: string; inviteUrl: string };
    expect(body.email).toBe("new@votatis.test");
    expect(body.inviteUrl).toContain("https://test/invite/");

    const [u] = await ctx.db.select().from(adminUser).where(eq(adminUser.email, "new@votatis.test"));
    expect(u.status).toBe("invited");
    expect(u.passwordHash).toBeNull();
  });
});
