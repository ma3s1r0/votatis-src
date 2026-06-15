import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "./db/test-db.js";
import { seedRoot, createInvite, acceptInvite } from "./db/auth.js";
import { createApp } from "./app.js";
import { InMemoryStorage } from "./storage.js";
import { FakeMosaic } from "./mosaic.js";
import { createReport, createAttachment } from "./db/repository.js";
import { attachment } from "./db/schema.js";
import type { Db } from "./db/repository.js";

const REVIEWER_EMAIL = "rev@votatis.test";
const REVIEWER_PASSWORD = "reviewer-password-123";

async function setup() {
  const db = await makeTestDb();
  const storage = new InMemoryStorage();
  const mosaic = new FakeMosaic();
  await seedRoot(db, "root@votatis.test", "root-password-123");
  await createInvite(db, REVIEWER_EMAIL, "reviewer");
  const { token } = await createInvite(db, REVIEWER_EMAIL, "reviewer");
  await acceptInvite(db, token, REVIEWER_PASSWORD);
  const app = createApp({ db, storage, mosaic, inviteBaseUrl: "https://test/invite" });
  return { db, storage, mosaic, app };
}

async function loginCookie(app: ReturnType<typeof createApp>) {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function storedAttachment(db: Db, reportId: string) {
  return createAttachment(db, {
    reportId,
    storageKey: `original/reports/${reportId}/x.png`,
    mime: "image/png",
    size: 1024,
    sha256: "deadbeef",
    status: "stored",
  });
}

function verifyBody() {
  return {
    verified: true,
    method: "현장 사진 대조",
    evidenceLinks: [
      { url: "https://example.com/e1", capturedAt: "2026-06-15T00:00:00.000Z", contentHash: "abc" },
    ],
  };
}

async function publicKeyOf(db: Db, id: string) {
  const [row] = await db.select({ publicKey: attachment.publicKey }).from(attachment).where(eq(attachment.id, id));
  return row.publicKey;
}

describe("공표 승인 플로우(admin) — verified=true 시 모자이크 트리거", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let cookie: string;

  beforeEach(async () => {
    ctx = await setup();
    cookie = await loginCookie(ctx.app);
  });

  it("assembly 제보 공표 승인 → 첨부 publicKey 생성", async () => {
    const r = await createReport(ctx.db, { title: "집회", domain: "assembly", status: "submitted" });
    const a = await storedAttachment(ctx.db, r.id);

    const res = await ctx.app.request(`/api/admin/reports/${r.id}/verification`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(verifyBody()),
    });
    expect(res.status).toBe(201);
    expect(ctx.mosaic.calls).toEqual([{ originalKey: a.storageKey }]);
    expect(await publicKeyOf(ctx.db, a.id)).toBe(`public/reports/${r.id}/x.png`);
  });

  it("election 제보 공표 승인 → 모자이크 미호출", async () => {
    const r = await createReport(ctx.db, { title: "선거", domain: "election", status: "submitted" });
    const a = await storedAttachment(ctx.db, r.id);

    const res = await ctx.app.request(`/api/admin/reports/${r.id}/verification`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(verifyBody()),
    });
    expect(res.status).toBe(201);
    expect(ctx.mosaic.calls).toEqual([]);
    expect(await publicKeyOf(ctx.db, a.id)).toBeNull();
  });

  it("verified=false(공표 아님) → 모자이크 미호출", async () => {
    const r = await createReport(ctx.db, { title: "집회", domain: "assembly", status: "submitted" });
    await storedAttachment(ctx.db, r.id);

    const res = await ctx.app.request(`/api/admin/reports/${r.id}/verification`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ ...verifyBody(), verified: false }),
    });
    expect(res.status).toBe(201);
    expect(ctx.mosaic.calls).toEqual([]);
  });

  it("재공표(재검증) → 멱등(중복 모자이크 없음)", async () => {
    const r = await createReport(ctx.db, { title: "집회", domain: "assembly", status: "submitted" });
    const a = await storedAttachment(ctx.db, r.id);

    for (let i = 0; i < 2; i++) {
      await ctx.app.request(`/api/admin/reports/${r.id}/verification`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(verifyBody()),
      });
    }
    expect(ctx.mosaic.calls).toEqual([{ originalKey: a.storageKey }]);
  });
});
