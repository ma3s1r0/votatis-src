import { makeTestDb } from "./db/test-db.js";
import { seedRoot } from "./db/auth.js";
import { createAuthApp } from "./auth-routes.js";
import type { Db } from "./db/repository.js";

export const ROOT_EMAIL = "root@votatis.test";
export const ROOT_PASSWORD = "root-password-123";

export async function setup() {
  const db = await makeTestDb();
  const root = await seedRoot(db, ROOT_EMAIL, ROOT_PASSWORD);
  const app = createAuthApp(db, { inviteBaseUrl: "https://test/invite" });
  return { db, root, app };
}

// 로그인 후 세션 쿠키 문자열 반환(없으면 null).
export async function loginCookie(
  app: ReturnType<typeof createAuthApp>,
  email: string,
  password: string,
): Promise<string | null> {
  const res = await app.request("/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  return setCookie.split(";")[0]; // name=value
}

export function jsonReq(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type { Db };
