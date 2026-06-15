import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryStorage } from "./storage.js";
import { setup, jsonReq, markVerified } from "./report.test-helpers.js";
import {
  setup as adminSetup,
  loginCookie,
  makeReport,
  disableUser,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { markVerified as markVerifiedDb } from "./report.test-helpers.js";

// InMemoryStorage.presignGet 단위 동작.
describe("InMemoryStorage.presignGet", () => {
  it("가짜 GET URL + 만료를 반환한다", async () => {
    const storage = new InMemoryStorage();
    const res = await storage.presignGet({ key: "reports/r1/x.png", expiresInSeconds: 300 });
    expect(res.url).toMatch(/^https?:\/\//);
    expect(res.expiresInSeconds).toBe(300);
  });
});

// 공개 다운로드: verified ∧ stored ∧ 소속 게이트.
describe("공개 첨부 다운로드", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  async function createReport(title = "다운로드테스트"): Promise<string> {
    const res = await ctx.app.request("/reports", jsonReq({ title }));
    return ((await res.json()) as { id: string }).id;
  }

  // create + finalize 로 stored 첨부 생성.
  async function storedAttachment(reportId: string): Promise<string> {
    const create = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "a.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    const { attachmentId, storageKey } = (await create.json()) as {
      attachmentId: string;
      storageKey: string;
    };
    ctx.storage.put(storageKey, 1024, "deadbeef");
    await ctx.app.request(`/reports/${reportId}/attachments/${attachmentId}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return attachmentId;
  }

  // pending(미finalize) 첨부 생성.
  async function pendingAttachment(reportId: string): Promise<string> {
    const create = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "p.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    return ((await create.json()) as { attachmentId: string }).attachmentId;
  }

  it("verified+stored+소속 → presigned GET URL(만료<=300)", async () => {
    const reportId = await createReport();
    const attachmentId = await storedAttachment(reportId);
    await markVerified(ctx.db, reportId, true);

    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/download`,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; expiresInSeconds: number };
    expect(json.url).toMatch(/^https?:\/\//);
    expect(json.expiresInSeconds).toBeLessThanOrEqual(300);
    // 민감 메타(storageKey) 비노출.
    expect(JSON.stringify(json)).not.toContain("storageKey");
  });

  it("미검증 report 의 첨부 다운로드 → 404", async () => {
    const reportId = await createReport();
    const attachmentId = await storedAttachment(reportId);
    // verified=false (기본)

    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/download`,
    );
    expect(res.status).toBe(404);
  });

  it("pending 첨부 다운로드 → 404(존재 누설 금지)", async () => {
    const reportId = await createReport();
    const attachmentId = await pendingAttachment(reportId);
    await markVerified(ctx.db, reportId, true);

    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/download`,
    );
    expect(res.status).toBe(404);
  });

  it("다른 report 의 attachmentId 끼워넣기 → 404(소속 불일치)", async () => {
    const reportA = await createReport("A");
    const reportB = await createReport("B");
    const attachmentB = await storedAttachment(reportB);
    await markVerified(ctx.db, reportA, true);
    await markVerified(ctx.db, reportB, true);

    const res = await ctx.app.request(
      `/reports/${reportA}/attachments/${attachmentB}/download`,
    );
    expect(res.status).toBe(404);
  });

  it("없는 attachmentId → 404", async () => {
    const reportId = await createReport();
    await markVerified(ctx.db, reportId, true);
    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/00000000-0000-0000-0000-000000000000/download`,
    );
    expect(res.status).toBe(404);
  });
});

// 관리 다운로드: requireReviewer 게이트 후 verified 무관 stored 발급.
describe("관리 첨부 다운로드", () => {
  let ctx: Awaited<ReturnType<typeof adminSetup>>;
  let cookie: string;

  beforeEach(async () => {
    ctx = await adminSetup();
    cookie = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
  });

  // stored 첨부를 직접 생성(공개 create→finalize 경로 재사용).
  async function storedAttachment(reportId: string): Promise<string> {
    const create = await ctx.app.request(`/api/reports/${reportId}/attachments/create`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.9" },
      body: JSON.stringify({ filename: "a.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    });
    const { attachmentId, storageKey } = (await create.json()) as {
      attachmentId: string;
      storageKey: string;
    };
    ctx.storage.put(storageKey, 1024, "deadbeef");
    await ctx.app.request(`/api/reports/${reportId}/attachments/${attachmentId}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return attachmentId;
  }

  // pending(미finalize) 첨부 생성(관리 경로).
  async function pendingAttachment(reportId: string): Promise<string> {
    const create = await ctx.app.request(`/api/reports/${reportId}/attachments/create`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.8" },
      body: JSON.stringify({ filename: "p.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    });
    return ((await create.json()) as { attachmentId: string }).attachmentId;
  }

  it("reviewer(active) + verified 무관 stored 첨부 → presigned GET URL", async () => {
    const r = await makeReport(ctx.db, "검토중 제보");
    const attachmentId = await storedAttachment(r.id);
    // verified=false 유지 — 검토 목적이므로 발급되어야 한다.

    const res = await ctx.app.request(
      `/api/admin/reports/${r.id}/attachments/${attachmentId}/download`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; expiresInSeconds: number };
    expect(json.url).toMatch(/^https?:\/\//);
    expect(json.expiresInSeconds).toBeLessThanOrEqual(300);
  });

  it("미인증 → 401", async () => {
    const r = await makeReport(ctx.db, "제보");
    const attachmentId = await storedAttachment(r.id);
    const res = await ctx.app.request(
      `/api/admin/reports/${r.id}/attachments/${attachmentId}/download`,
    );
    expect(res.status).toBe(401);
  });

  it("비active(disabled) 세션 → 403", async () => {
    const r = await makeReport(ctx.db, "제보");
    const attachmentId = await storedAttachment(r.id);
    await disableUser(ctx.db, ctx.reviewer.id);
    const res = await ctx.app.request(
      `/api/admin/reports/${r.id}/attachments/${attachmentId}/download`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(403);
  });

  it("verified 인 제보의 stored 첨부도 발급된다(verified 무관)", async () => {
    const r = await makeReport(ctx.db, "검증된 제보");
    const attachmentId = await storedAttachment(r.id);
    await markVerifiedDb(ctx.db, r.id, true);
    const res = await ctx.app.request(
      `/api/admin/reports/${r.id}/attachments/${attachmentId}/download`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(200);
  });

  // 관리 경로 stored 게이트 회귀: stored 가 아니면(pending) verified·인증과 무관하게 404.
  it("pending 첨부 → 404(stored 게이트)", async () => {
    const r = await makeReport(ctx.db, "검토중 제보");
    const attachmentId = await pendingAttachment(r.id);
    const res = await ctx.app.request(
      `/api/admin/reports/${r.id}/attachments/${attachmentId}/download`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });

  // 관리 경로 소속 게이트 회귀: 다른 report 의 attachmentId 끼워넣기 → 404.
  it("다른 report 의 attachmentId 끼워넣기 → 404(소속 불일치)", async () => {
    const rA = await makeReport(ctx.db, "A");
    const rB = await makeReport(ctx.db, "B");
    const attachmentB = await storedAttachment(rB.id);
    const res = await ctx.app.request(
      `/api/admin/reports/${rA.id}/attachments/${attachmentB}/download`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });

  it("없는 attachmentId → 404", async () => {
    const r = await makeReport(ctx.db, "제보");
    const res = await ctx.app.request(
      `/api/admin/reports/${r.id}/attachments/00000000-0000-0000-0000-000000000000/download`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });
});
