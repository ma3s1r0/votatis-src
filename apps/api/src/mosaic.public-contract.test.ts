import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup } from "./report.test-helpers.js";
import { processMosaicForReport } from "./db/mosaic.js";
import { createReport, createAttachment } from "./db/repository.js";
import { FakeMosaic } from "./mosaic.js";
import { report } from "./db/schema.js";
import type { Db } from "./db/repository.js";

async function markVerified(db: Db, reportId: string) {
  await db.update(report).set({ vVerified: true }).where(eq(report.id, reportId));
}

// 외부(공개) 응답 어디에도 original/ 키·원본 storageKey 가 나타나지 않는다.
describe("공개 직렬화 계약(0016) — original 키 미노출", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("assembly 공개 상세·다운로드 응답에 original/ 키·storageKey 미포함", async () => {
    const r = await createReport(ctx.db, { title: "집회", domain: "assembly", status: "submitted" });
    const a = await createAttachment(ctx.db, {
      reportId: r.id,
      storageKey: `original/reports/${r.id}/secret.png`,
      mime: "image/png",
      size: 1024,
      sha256: "deadbeef",
      status: "stored",
    });
    await processMosaicForReport(ctx.db, {
      reportId: r.id,
      mosaic: new FakeMosaic(),
      storage: ctx.storage,
    });
    await markVerified(ctx.db, r.id);

    const detail = await ctx.app.request(`/reports/${r.id}`);
    const detailText = await detail.text();
    expect(detailText).not.toContain("original/");
    expect(detailText).not.toContain("storageKey");
    expect(detailText).not.toContain("publicKey");
    expect(detailText).not.toContain("secret.png");

    const dl = await ctx.app.request(`/reports/${r.id}/attachments/${a.id}/download`);
    const dlText = await dl.text();
    expect(dlText).not.toContain("original/");
    expect(dlText).not.toContain("storageKey");
  });
});
