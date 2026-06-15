import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Db } from "./db/repository.js";
import type { adminUser } from "./db/schema.js";
import {
  createInvite,
  acceptInvite,
  InviteError,
  login,
  resolveSession,
  revokeSession,
  isRateLimited,
  recordLoginAttempt,
} from "./db/auth.js";

type AdminUser = typeof adminUser.$inferSelect;
const SESSION_COOKIE = "votatis_session";

type Env = {
  Variables: { db: Db; user: AdminUser };
};

// 세션 쿠키 → 사용자 해석. 미인증이면 user 미설정.
const loadSession = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const user = await resolveSession(c.get("db"), token);
    if (user) c.set("user", user);
  }
  await next();
});

// 인증 + active 게이트. 미인증 401 / 비active 403.
const requireReviewer = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (user.status !== "active") return c.json({ error: "forbidden" }, 403);
  await next();
});

// root 전용. requireReviewer 이후에 사용. role!=root 면 403.
const requireRoot = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (user.status !== "active" || user.role !== "root") {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
});

export function createAuthApp(db: Db, opts: { inviteBaseUrl?: string } = {}) {
  const app = new Hono<Env>();
  const inviteBaseUrl = opts.inviteBaseUrl ?? "https://console.votatis.local/invite";

  // db 주입 + 세션 로드
  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });
  app.use("*", loadSession);

  // 로그인: 성공 시 httpOnly 쿠키 발급. 실패는 동일 401 메시지(계정 누설 금지).
  app.post("/login", async (c) => {
    const { email, password } = await c.req.json<{ email?: string; password?: string }>();
    if (!email || !password) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    const ip = c.req.header("x-forwarded-for") ?? "unknown";
    const key = `${ip}|${email}`;
    if (await isRateLimited(db, key)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    await recordLoginAttempt(db, key);

    const result = await login(db, email, password);
    if (!result) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    setCookie(c, SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });
    return c.json({ ok: true });
  });

  // 현재 사용자 조회 (보호됨)
  app.get("/me", requireReviewer, (c) => {
    const u = c.get("user");
    return c.json({ id: u.id, email: u.email, role: u.role, status: u.status });
  });

  // 로그아웃: 세션 폐기 + 쿠키 만료
  app.post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await revokeSession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // 초대 발급 (root 전용)
  app.post("/invites", requireRoot, async (c) => {
    const { email, role } = await c.req.json<{ email?: string; role?: "reviewer" | "root" }>();
    if (!email) return c.json({ error: "email_required" }, 400);
    try {
      const { user, token } = await createInvite(db, email, role ?? "reviewer");
      const inviteUrl = `${inviteBaseUrl}/${token}`;
      return c.json({ userId: user.id, email: user.email, inviteUrl }, 201);
    } catch (e) {
      if (e instanceof InviteError && e.reason === "already-active") {
        return c.json({ error: "already_active" }, 409);
      }
      throw e;
    }
  });

  // 초대 수락: 토큰으로 비밀번호 설정 → 계정 활성화
  app.post("/invites/:token/accept", async (c) => {
    const token = c.req.param("token");
    const { password } = await c.req.json<{ password?: string }>();
    if (!password) return c.json({ error: "password_required" }, 400);
    try {
      const user = await acceptInvite(db, token, password);
      return c.json({ id: user.id, email: user.email, status: user.status });
    } catch (e) {
      if (e instanceof InviteError) {
        const status = e.reason === "expired" || e.reason === "used" ? 410 : 400;
        return c.json({ error: e.reason }, status);
      }
      throw e;
    }
  });

  return app;
}

export { requireReviewer, requireRoot, SESSION_COOKIE };
