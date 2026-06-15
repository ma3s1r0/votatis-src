import { describe, it, expect, beforeEach } from "vitest";
import { setup, loginCookie, jsonReq, ROOT_EMAIL, ROOT_PASSWORD } from "./auth.test-helpers.js";
import { createInvite, acceptInvite, resolveSession, isRateLimited } from "./db/auth.js";
import { adminUser, adminSession, loginAttempt } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

// QA 추가: 스펙 무결성("계정 disable 시 기존 세션 무효화") 및 우회 가능성 점검.
describe("QA 회귀 — 보안 불변식", () => {
  // 무결성: disabled 계정의 살아있는 세션으로 보호 엔드포인트 접근 → 403.
  it("disabled 계정의 기존 세션은 보호 엔드포인트에서 거부된다 (403)", async () => {
    // reviewer 활성화 + 로그인.
    const { token } = await createInvite(ctx.db, "d@votatis.test", "reviewer");
    await acceptInvite(ctx.db, token, "reviewer-pw-123");
    const cookie = await loginCookie(ctx.app, "d@votatis.test", "reviewer-pw-123");
    expect(cookie).not.toBeNull();

    // 정상 동작 확인.
    const before = await ctx.app.request("/me", { headers: { cookie: cookie! } });
    expect(before.status).toBe(200);

    // 계정 disable.
    await ctx.db
      .update(adminUser)
      .set({ status: "disabled" })
      .where(eq(adminUser.email, "d@votatis.test"));

    const after = await ctx.app.request("/me", { headers: { cookie: cookie! } });
    expect(after.status).toBe(403);
  });

  // 관찰: resolveSession 은 user.status 를 재검증하지 않아 disabled 도 non-null 을 돌려준다.
  // (게이트는 requireReviewer 의 status 체크에 의존). 우회 가능성 문서화 목적.
  it("resolveSession 은 disabled 계정도 user 를 반환한다 (라우트 게이트에 의존)", async () => {
    const { user } = await createInvite(ctx.db, "e@votatis.test", "reviewer");
    const sessToken = randomBytes(32).toString("hex");
    await ctx.db.insert(adminSession).values({
      adminUserId: user.id,
      tokenHash: createHash("sha256").update(sessToken).digest("hex"),
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await ctx.db
      .update(adminUser)
      .set({ status: "disabled" })
      .where(eq(adminUser.id, user.id));

    const resolved = await resolveSession(ctx.db, sessToken);
    // resolveSession 자체는 status 무관하게 user 반환 — requireReviewer 가 막아야 한다.
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("disabled");
  });

  // rate limit: 성공 로그인도 시도로 카운트된다 → 정상 사용자도 임계 초과 시 잠긴다.
  // 보안상 안전(보수적)이나, 동작을 명시적으로 고정.
  it("성공 로그인도 rate limit 카운트에 포함된다", async () => {
    const ip = "9.9.9.9";
    const key = `${ip}|${ROOT_EMAIL}`;
    for (let i = 0; i < 10; i++) {
      const res = await ctx.app.request("/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email: ROOT_EMAIL, password: ROOT_PASSWORD }),
      });
      expect(res.status).toBe(200);
    }
    expect(await isRateLimited(ctx.db, key)).toBe(true);
    const rows = await ctx.db.select().from(loginAttempt).where(eq(loginAttempt.key, key));
    expect(rows.length).toBe(10);
  });

  // accept 의 password 검증: 빈/누락 비번 거부(400). 약한 비번 정책은 스펙 비대상.
  it("비밀번호 없이 accept → 400, status 불변", async () => {
    const { user, token } = await createInvite(ctx.db, "f@votatis.test", "reviewer");
    const res = await ctx.app.request(`/invites/${token}/accept`, jsonReq({}));
    expect(res.status).toBe(400);
    const [u] = await ctx.db.select().from(adminUser).where(eq(adminUser.id, user.id));
    expect(u.status).toBe("invited");
    expect(u.passwordHash).toBeNull();
  });

  // 누설 방지: invited(비번 미설정) 계정에 임의 비번 로그인 시도도 동일 401.
  it("invited 계정 로그인 시도 → active 와 구분 없는 401", async () => {
    await createInvite(ctx.db, "g@votatis.test", "reviewer");
    const res = await ctx.app.request("/login", jsonReq({ email: "g@votatis.test", password: "x" }));
    expect(res.status).toBe(401);
  });
});
