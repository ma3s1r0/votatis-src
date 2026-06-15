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
// 0017 교차검증: 서로 다른 2인 동의를 시험하기 위한 2번째 active reviewer.
export const REVIEWER2_EMAIL = "rev2@votatis.test";
export const REVIEWER2_PASSWORD = "reviewer2-password-123";

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

  // 2번째 active reviewer(0017 교차검증).
  const { token: token2 } = await createInvite(db, REVIEWER2_EMAIL, "reviewer");
  const reviewer2 = await acceptInvite(db, token2, REVIEWER2_PASSWORD);

  const app = createApp({ db, storage, inviteBaseUrl: "https://test/invite" });
  return { db, storage, root, reviewer, reviewer2, app };
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

export async function makeReport(db: Db, title = "테스트 제보", domain?: string) {
  const r = await createReport(db, { title, status: "submitted", domain });
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

// 0017: 서로 다른 reviewer 2인 동의로 verified=true 를 확정시키는 헬퍼.
// 첫 reviewer 가 근거 포함 판정(동의 1/2), 두번째 reviewer 가 동의(2/2 → verified 확정).
// overrides 는 판정 바디(validity/severity 등)에 적용된다.
export async function approveByTwo(
  app: ReturnType<typeof createApp>,
  reportId: string,
  overrides: Record<string, unknown> = {},
) {
  const c1 = (await loginCookie(app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
  const c2 = (await loginCookie(app, REVIEWER2_EMAIL, REVIEWER2_PASSWORD))!;
  const body = JSON.stringify(validVerificationBody({ verified: true, ...overrides }));
  const first = await app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: c1 },
    body,
  });
  const second = await app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: c2 },
    body,
  });
  return { first, second };
}

export type { Db };
