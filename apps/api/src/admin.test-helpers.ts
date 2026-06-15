import { eq } from "drizzle-orm";
import { makeTestDb } from "./db/test-db.js";
import { seedRoot, createInvite, acceptInvite } from "./db/auth.js";
import { createApp } from "./app.js";
import { InMemoryStorage } from "./storage.js";
import { createReport } from "./db/repository.js";
import { adminUser } from "./db/schema.js";
import type { Db } from "./db/repository.js";

export const ROOT_EMAIL = "root@votatis.test";
export const ROOT_PASSWORD = "root-password-123";
export const REVIEWER_EMAIL = "rev@votatis.test";
export const REVIEWER_PASSWORD = "reviewer-password-123";

export async function setup() {
  const db = await makeTestDb();
  const storage = new InMemoryStorage();
  const root = await seedRoot(db, ROOT_EMAIL, ROOT_PASSWORD);

  // active reviewer 한 명 준비(초대 → 수락).
  await createInvite(db, REVIEWER_EMAIL, "reviewer");
  // 초대 토큰을 다시 발급받기 위해 acceptInvite 가 필요 → createInvite 토큰 사용.
  // createInvite 는 토큰을 반환하므로 재호출 대신 직접 보관.
  const { token } = await createInvite(db, REVIEWER_EMAIL, "reviewer");
  const reviewer = await acceptInvite(db, token, REVIEWER_PASSWORD);

  const app = createApp({ db, storage, inviteBaseUrl: "https://test/invite" });
  return { db, storage, root, reviewer, app };
}

// 로그인 후 세션 쿠키(name=value) 반환.
export async function loginCookie(
  app: ReturnType<typeof createApp>,
  email: string,
  password: string,
): Promise<string | null> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  return setCookie.split(";")[0];
}

export async function makeReport(db: Db, title = "테스트 제보") {
  const r = await createReport(db, { title, status: "submitted" });
  return r;
}

// 계정 disable.
export async function disableUser(db: Db, userId: string) {
  await db.update(adminUser).set({ status: "disabled" }).where(eq(adminUser.id, userId));
}

// 유효한 판정 바디(근거 포함).
export function validVerificationBody(overrides: Record<string, unknown> = {}) {
  return {
    confidence: 80,
    validity: "valid",
    severity: "3",
    legalIssue: null,
    verified: true,
    method: "현장 사진·선관위 공고 대조",
    notes: "확인됨",
    evidenceLinks: [
      {
        url: "https://example.com/evidence-1",
        capturedAt: "2026-06-15T00:00:00.000Z",
        contentHash: "abc123",
      },
    ],
    ...overrides,
  };
}

export type { Db };
