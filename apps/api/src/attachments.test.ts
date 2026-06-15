import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq } from "./report.test-helpers.js";
import { attachment } from "./db/schema.js";

let ctx: Awaited<ReturnType<typeof setup>>;

async function createReport(): Promise<string> {
  const res = await ctx.app.request("/reports", jsonReq({ title: "첨부테스트" }));
  return ((await res.json()) as { id: string }).id;
}

beforeEach(async () => {
  ctx = await setup();
});

describe("첨부 create", () => {
  // 수용 기준: 허용 mime/size 내에서만 presigned PUT + attachment(pending).
  it("허용 mime/size → 201, presigned URL + pending attachment", async () => {
    const reportId = await createReport();
    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "a.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      attachmentId: string;
      uploadUrl: string;
      method: string;
      expiresInSeconds: number;
      status: string;
    };
    expect(json.uploadUrl).toMatch(/^https?:\/\//);
    expect(json.method).toBe("PUT");
    expect(json.status).toBe("pending");
    // 결정 3: presigned 만료가 짧게(<=5분).
    expect(json.expiresInSeconds).toBeLessThanOrEqual(300);

    const [row] = await ctx.db
      .select()
      .from(attachment)
      .where(eq(attachment.id, json.attachmentId));
    expect(row.status).toBe("pending");
    expect(row.sha256).toBeNull();
  });

  // 수용 기준: 허용 외 mime → 400.
  it("허용 외 mime → 400", async () => {
    const reportId = await createReport();
    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "a.exe", mime: "application/x-msdownload", size: 1024 }),
    );
    expect(res.status).toBe(400);
  });

  // 수용 기준: size 초과(15MB) → 413.
  it("size 초과 → 413", async () => {
    const reportId = await createReport();
    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "big.pdf", mime: "application/pdf", size: 16 * 1024 * 1024 }),
    );
    expect(res.status).toBe(413);
  });

  // QA: 존재하지 않는 reportId 로 create → FK 위반 500 이 아니라 404.
  it("없는 reportId 로 create → 404", async () => {
    const res = await ctx.app.request(
      `/reports/00000000-0000-0000-0000-000000000000/attachments/create`,
      jsonReq({ filename: "a.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("not_found");
  });

  // QA: 첨부 create 도 POST /reports 와 동일한 IP rate limit 적용 → 429.
  it("동일 IP 첨부 create 임계 초과 → 429", async () => {
    const reportId = await createReport();
    // createReport 가 IP 10.0.0.1 로 1건 기록됨. 임계(5건) 초과까지 반복.
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const res = await ctx.app.request(
        `/reports/${reportId}/attachments/create`,
        jsonReq({ filename: `a${i}.png`, mime: "image/png", size: 1024, sha256: "deadbeef" }),
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe("첨부 finalize", () => {
  async function createAttachment(reportId: string, size = 1024, sha = "deadbeef") {
    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "a.png", mime: "image/png", size, sha256: sha }),
    );
    return (await res.json()) as { attachmentId: string; storageKey: string };
  }

  // 수용 기준: 객체가 실제 존재할 때만 stored + sha256 확정.
  it("객체 업로드 후 finalize → stored + sha256 확정", async () => {
    const reportId = await createReport();
    const { attachmentId, storageKey } = await createAttachment(reportId, 1024, "deadbeef");
    // presigned PUT 업로드 시뮬레이션
    ctx.storage.put(storageKey, 1024, "deadbeef");

    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; sha256: string };
    expect(json.status).toBe("stored");
    expect(json.sha256).toBe("deadbeef");

    const [row] = await ctx.db
      .select()
      .from(attachment)
      .where(eq(attachment.id, attachmentId));
    expect(row.status).toBe("stored");
    expect(row.sha256).toBe("deadbeef");
  });

  // 수용 기준: 객체 없으면 stored 전환 거부(409).
  it("업로드 안 된 채 finalize → 409", async () => {
    const reportId = await createReport();
    const { attachmentId } = await createAttachment(reportId);
    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(409);
  });

  // 무결성: 신고 sha256 과 실제 객체 해시 불일치 → 거부(409).
  it("sha256 불일치 → 409", async () => {
    const reportId = await createReport();
    const { attachmentId, storageKey } = await createAttachment(reportId, 1024, "deadbeef");
    ctx.storage.put(storageKey, 1024, "TAMPERED");
    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(409);
  });
});
