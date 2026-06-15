import { describe, it, expect, beforeEach } from "vitest";
import { setup, loginCookie, ROOT_EMAIL, ROOT_PASSWORD } from "./auth.test-helpers.js";
import { createInvite, login } from "./db/auth.js";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

describe("세션", () => {
  // 수용 기준: 로그인 후 /me 가 사용자 반환.
  it("로그인 후 /me 가 현재 사용자를 반환한다", async () => {
    const cookie = await loginCookie(ctx.app, ROOT_EMAIL, ROOT_PASSWORD);
    const res = await ctx.app.request("/me", { headers: { cookie: cookie! } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; role: string };
    expect(body.email).toBe(ROOT_EMAIL);
    expect(body.role).toBe("root");
  });

  // 수용 기준: 쿠키 없이 보호 엔드포인트 → 401.
  it("세션 쿠키 없이 /me → 401", async () => {
    const res = await ctx.app.request("/me");
    expect(res.status).toBe(401);
  });

  // 수용 기준: invited(비active) 세션으로 보호 엔드포인트 → 403.
  it("invited(비active) 사용자 세션 → 403", async () => {
    // invited 사용자에 대해 강제로 세션 발급(로그인 경로는 active 만 허용하므로 직접 생성).
    const { user } = await createInvite(ctx.db, "inv@votatis.test", "reviewer");
    // 직접 세션 토큰 발급 (테스트 목적): login 은 active 만 허용하므로 우회한다.
    // adminSession 직접 삽입.
    const { adminSession } = await import("./db/schema.js");
    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await ctx.db.insert(adminSession).values({
      adminUserId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const res = await ctx.app.request("/me", {
      headers: { cookie: `votatis_session=${token}` },
    });
    expect(res.status).toBe(403);
  });

  // 수용 기준: 로그아웃 후 동일 쿠키로 보호 엔드포인트 → 401.
  it("로그아웃 후 동일 세션 쿠키 → 401", async () => {
    const cookie = await loginCookie(ctx.app, ROOT_EMAIL, ROOT_PASSWORD);
    const before = await ctx.app.request("/me", { headers: { cookie: cookie! } });
    expect(before.status).toBe(200);

    const out = await ctx.app.request("/logout", {
      method: "POST",
      headers: { cookie: cookie! },
    });
    expect(out.status).toBe(200);

    const after = await ctx.app.request("/me", { headers: { cookie: cookie! } });
    expect(after.status).toBe(401);
  });

  // 무결성: 직접 login() 호출도 active 가 아니면 세션을 발급하지 않는다.
  it("비active 계정은 login() 으로 세션을 받지 못한다", async () => {
    await createInvite(ctx.db, "pending@votatis.test", "reviewer");
    const result = await login(ctx.db, "pending@votatis.test", "anything");
    expect(result).toBeNull();
  });
});
