import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq, markVerified } from "./report.test-helpers.js";
import { attachment } from "./db/schema.js";

let ctx: Awaited<ReturnType<typeof setup>>;

async function createReport(title: string, extra: object = {}, ip = "10.0.0.1"): Promise<string> {
  const res = await ctx.app.request("/reports", jsonReq({ title, ...extra }, ip));
  return ((await res.json()) as { id: string }).id;
}

beforeEach(async () => {
  ctx = await setup();
});

describe("QA 회귀 — 공개 노출 불변식", () => {
  // 우회 점검: vVerified=false 로 명시된 report 도 목록/상세에서 제외돼야 한다.
  it("vVerified=false 인 report 는 목록·상세 모두에서 제외(404)", async () => {
    const id = await createReport("거부됨", {}, "1.2.3.4");
    await markVerified(ctx.db, id, false);

    const list = await ctx.app.request("/reports");
    const listJson = (await list.json()) as { total: number; items: { id: string }[] };
    expect(listJson.total).toBe(0);
    expect(listJson.items).toEqual([]);

    const detail = await ctx.app.request(`/reports/${id}`);
    expect(detail.status).toBe(404);
  });

  // 우회 점검: 갓 생성된(vVerified=null) report 는 공개에 새지 않는다.
  it("vVerified=null(기본) report 는 공개에 노출되지 않는다", async () => {
    const id = await createReport("미검증기본", {}, "2.3.4.5");
    const detail = await ctx.app.request(`/reports/${id}`);
    expect(detail.status).toBe(404);

    const list = await ctx.app.request("/reports");
    const listJson = (await list.json()) as { total: number };
    expect(listJson.total).toBe(0);
  });

  // 무결성: finalize 전 pending 첨부는 검증된 report 상세에 새지 않는다.
  it("pending 첨부는 공개 상세에 노출되지 않는다(stored 만)", async () => {
    const reportId = await createReport("첨부보유", {}, "3.4.5.6");

    // pending 첨부 1개 생성(업로드/ finalize 안 함)
    const createRes = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "p.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    const { attachmentId } = (await createRes.json()) as {
      attachmentId: string;
    };

    // stored 첨부 1개 생성 + finalize
    const createRes2 = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "s.png", mime: "image/png", size: 2048, sha256: "cafebabe" }),
    );
    const att2 = (await createRes2.json()) as { attachmentId: string; storageKey: string };
    ctx.storage.put(att2.storageKey, 2048, "cafebabe");
    await ctx.app.request(
      `/reports/${reportId}/attachments/${att2.attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );

    await markVerified(ctx.db, reportId);

    const detail = await ctx.app.request(`/reports/${reportId}`);
    const json = (await detail.json()) as { attachments: { id: string }[] };
    const ids = json.attachments.map((a) => a.id);
    expect(ids).toContain(att2.attachmentId);
    expect(ids).not.toContain(attachmentId);

    // sanity: pending 행은 DB 에 그대로 존재(노출만 안 됨)
    const [row] = await ctx.db
      .select()
      .from(attachment)
      .where(eq(attachment.id, attachmentId));
    expect(row.status).toBe("pending");
  });

  // 우회 점검: 다른 report 경로로 남의 첨부 finalize 시도 → not_found(404).
  it("attachment 소유 report 가 아닌 경로로 finalize → 404", async () => {
    const reportA = await createReport("A", {}, "4.5.6.7");
    const reportB = await createReport("B", {}, "5.6.7.8");

    const createRes = await ctx.app.request(
      `/reports/${reportA}/attachments/create`,
      jsonReq({ filename: "a.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    const { attachmentId, storageKey } = (await createRes.json()) as {
      attachmentId: string;
      storageKey: string;
    };
    ctx.storage.put(storageKey, 1024, "deadbeef");

    // reportB 경로로 reportA 의 첨부 finalize 시도
    const res = await ctx.app.request(
      `/reports/${reportB}/attachments/${attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(404);
  });

  // 무결성: 이미 stored 된 첨부 재-finalize → 409(중복 전환 차단).
  it("이미 stored 된 첨부 재-finalize → 409", async () => {
    const reportId = await createReport("재finalize", {}, "6.7.8.9");
    const createRes = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "a.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    const { attachmentId, storageKey } = (await createRes.json()) as {
      attachmentId: string;
      storageKey: string;
    };
    ctx.storage.put(storageKey, 1024, "deadbeef");

    const first = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(first.status).toBe(200);

    const second = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(second.status).toBe(409);
  });

  // 무결성: create 시 신고 크기와 실제 객체 크기 불일치 → 409(stored 전환 거부).
  it("size 불일치 → 409 (status 는 pending 유지)", async () => {
    const reportId = await createReport("size불일치", {}, "7.8.9.10");
    const createRes = await ctx.app.request(
      `/reports/${reportId}/attachments/create`,
      jsonReq({ filename: "a.png", mime: "image/png", size: 1024, sha256: "deadbeef" }),
    );
    const { attachmentId, storageKey } = (await createRes.json()) as {
      attachmentId: string;
      storageKey: string;
    };
    // 실제 객체는 다른 크기로 업로드됨
    ctx.storage.put(storageKey, 9999, "deadbeef");

    const res = await ctx.app.request(
      `/reports/${reportId}/attachments/${attachmentId}/finalize`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(res.status).toBe(409);

    const [row] = await ctx.db
      .select()
      .from(attachment)
      .where(eq(attachment.id, attachmentId));
    expect(row.status).toBe("pending");
  });

  // 봇 방지: honeypot(website) 채워지면 400.
  it("honeypot(website) 채워지면 400", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "봇", website: "http://spam" }, "9.1.1.1"),
    );
    expect(res.status).toBe(400);
  });
});
