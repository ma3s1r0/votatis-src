import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "./db/test-db.js";
import { InMemoryStorage } from "./storage.js";
import { FakeMosaic } from "./mosaic.js";
import { processMosaicForReport } from "./db/mosaic.js";
import { createReport, createAttachment } from "./db/repository.js";
import { attachment } from "./db/schema.js";
import type { Db } from "./db/repository.js";

// stored 첨부를 직접 생성(original/ prefix 키).
async function storedAttachment(db: Db, reportId: string, suffix = "x.png") {
  const key = `original/reports/${reportId}/${suffix}`;
  const a = await createAttachment(db, {
    reportId,
    storageKey: key,
    mime: "image/png",
    size: 1024,
    sha256: "deadbeef",
    status: "stored",
  });
  return a;
}

async function publicKeyOf(db: Db, attachmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ publicKey: attachment.publicKey })
    .from(attachment)
    .where(eq(attachment.id, attachmentId));
  return row.publicKey;
}

describe("공표 처리(모자이크) — processMosaicForReport", () => {
  let db: Db;
  let storage: InMemoryStorage;
  let mosaic: FakeMosaic;

  beforeEach(async () => {
    db = await makeTestDb();
    storage = new InMemoryStorage();
    mosaic = new FakeMosaic();
  });

  it("assembly 제보 공표 시 stored 첨부마다 MosaicPort.process 호출·publicKey 저장", async () => {
    const r = await createReport(db, { title: "집회", domain: "assembly", status: "submitted" });
    const a = await storedAttachment(db, r.id);

    await processMosaicForReport(db, { reportId: r.id, mosaic, storage });

    expect(mosaic.calls).toEqual([{ originalKey: a.storageKey }]);
    expect(await publicKeyOf(db, a.id)).toBe("public/reports/" + r.id + "/x.png");
  });

  it("election 제보 공표 시 모자이크 처리가 호출되지 않는다(domain 분기)", async () => {
    const r = await createReport(db, { title: "선거", domain: "election", status: "submitted" });
    const a = await storedAttachment(db, r.id);

    await processMosaicForReport(db, { reportId: r.id, mosaic, storage });

    expect(mosaic.calls).toEqual([]);
    expect(await publicKeyOf(db, a.id)).toBeNull();
  });

  it("멱등: 이미 publicKey 가 있는 첨부는 재처리 시 skip(중복 호출 없음)", async () => {
    const r = await createReport(db, { title: "집회", domain: "assembly", status: "submitted" });
    const a = await storedAttachment(db, r.id);

    await processMosaicForReport(db, { reportId: r.id, mosaic, storage });
    await processMosaicForReport(db, { reportId: r.id, mosaic, storage });

    // 두 번째 호출에서 추가 process 호출 없음.
    expect(mosaic.calls).toEqual([{ originalKey: a.storageKey }]);
    expect(await publicKeyOf(db, a.id)).toBe("public/reports/" + r.id + "/x.png");
  });

  it("pending 첨부는 처리하지 않는다(stored 만)", async () => {
    const r = await createReport(db, { title: "집회", domain: "assembly", status: "submitted" });
    await createAttachment(db, {
      reportId: r.id,
      storageKey: `original/reports/${r.id}/pending.png`,
      mime: "image/png",
      size: 1024,
      status: "pending",
    });

    await processMosaicForReport(db, { reportId: r.id, mosaic, storage });
    expect(mosaic.calls).toEqual([]);
  });
});
