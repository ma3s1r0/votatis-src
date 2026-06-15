import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup } from "./report.test-helpers.js";
import { processMosaicForReport } from "./db/mosaic.js";
import { createReport, createAttachment } from "./db/repository.js";
import { FakeMosaic } from "./mosaic.js";
import { report } from "./db/schema.js";
import type { Db } from "./db/repository.js";

// 0004 없이 공개 노출을 만들기 위해 verified 직접 세팅.
async function markVerified(db: Db, reportId: string) {
  await db.update(report).set({ vVerified: true }).where(eq(report.id, reportId));
}

async function storedAttachment(db: Db, reportId: string, suffix = "x.png") {
  return createAttachment(db, {
    reportId,
    storageKey: `original/reports/${reportId}/${suffix}`,
    mime: "image/png",
    size: 1024,
    sha256: "deadbeef",
    status: "stored",
  });
}

describe("공개 다운로드 게이트(0016) — assembly publicKey 만", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("assembly: 공표 처리 후 공개 다운로드는 publicKey presigned GET 만(original 키 미노출)", async () => {
    const r = await createReport(ctx.db, { title: "집회", domain: "assembly", status: "submitted" });
    const a = await storedAttachment(ctx.db, r.id);
    await processMosaicForReport(ctx.db, {
      reportId: r.id,
      mosaic: new FakeMosaic(),
      storage: ctx.storage,
    });
    await markVerified(ctx.db, r.id);

    const res = await ctx.app.request(`/reports/${r.id}/attachments/${a.id}/download`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    // 공개본(public/) 키만 — original/ 절대 미노출.
    expect(json.url).toContain("public/reports/");
    expect(json.url).not.toContain("original/");
  });

  it("assembly: publicKey 미처리 → 공개 다운로드 404(fail-closed, 원본 누설 금지)", async () => {
    const r = await createReport(ctx.db, { title: "집회", domain: "assembly", status: "submitted" });
    const a = await storedAttachment(ctx.db, r.id);
    await markVerified(ctx.db, r.id);
    // 모자이크 처리 안 함 → publicKey null.

    const res = await ctx.app.request(`/reports/${r.id}/attachments/${a.id}/download`);
    expect(res.status).toBe(404);
  });

  it("election: 기존 0008 동작 그대로(storageKey presigned GET)", async () => {
    const r = await createReport(ctx.db, { title: "선거", domain: "election", status: "submitted" });
    const a = await storedAttachment(ctx.db, r.id);
    await markVerified(ctx.db, r.id);

    const res = await ctx.app.request(`/reports/${r.id}/attachments/${a.id}/download`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string };
    // election 은 원본 키(original/...) 그대로 발급.
    expect(json.url).toContain(a.storageKey);
  });
});
