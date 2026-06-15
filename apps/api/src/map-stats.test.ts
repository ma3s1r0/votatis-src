import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq, markVerified } from "./report.test-helpers.js";
import { report } from "./db/schema.js";

let ctx: Awaited<ReturnType<typeof setup>>;

async function createReport(title: string, extra: object = {}, ip = "10.0.0.1"): Promise<string> {
  const res = await ctx.app.request("/reports", jsonReq({ title, ...extra }, ip));
  return ((await res.json()) as { id: string }).id;
}

async function setStatus(id: string, status: string) {
  await ctx.db.update(report).set({ status }).where(eq(report.id, id));
}

type MapStats = {
  items: {
    sido: string | null;
    total: number;
    byStatus: { verified: number; reviewing: number; unverified: number };
  }[];
};

beforeEach(async () => {
  ctx = await setup();
});

describe("GET /map-stats — 시도별 상태 버킷 집계", () => {
  it("시도별 검증됨/검증중/미검증 카운트를 집계한다", async () => {
    const v = await createReport("검증됨", { sido: "서울" }, "1.1.1.1");
    await markVerified(ctx.db, v);
    const r = await createReport("검증중", { sido: "서울" }, "1.1.1.2");
    await setStatus(r, "reviewing");
    await createReport("미검증", { sido: "서울" }, "1.1.1.3");

    const res = await ctx.app.request("/map-stats");
    expect(res.status).toBe(200);
    const json = (await res.json()) as MapStats;
    const seoul = json.items.find((i) => i.sido === "서울")!;
    expect(seoul.byStatus).toEqual({ verified: 1, reviewing: 1, unverified: 1 });
    expect(seoul.total).toBe(3);
  });

  it("여러 시도가 각각 분리 집계되고 total = 버킷 합", async () => {
    const a = await createReport("서울검증", { sido: "서울" }, "2.0.0.1");
    await markVerified(ctx.db, a);
    await createReport("부산미검증", { sido: "부산" }, "2.0.0.2");

    const res = await ctx.app.request("/map-stats");
    const json = (await res.json()) as MapStats;
    const seoul = json.items.find((i) => i.sido === "서울")!;
    const busan = json.items.find((i) => i.sido === "부산")!;
    expect(seoul.byStatus).toEqual({ verified: 1, reviewing: 0, unverified: 0 });
    expect(busan.byStatus).toEqual({ verified: 0, reviewing: 0, unverified: 1 });
    for (const it of json.items) {
      expect(it.total).toBe(it.byStatus.verified + it.byStatus.reviewing + it.byStatus.unverified);
    }
  });

  it("sido 가 null 인 제보는 미지정 버킷(sido=null)으로 분리", async () => {
    await createReport("지역없음", {}, "3.0.0.1");
    const res = await ctx.app.request("/map-stats");
    const json = (await res.json()) as MapStats;
    const unspecified = json.items.find((i) => i.sido === null)!;
    expect(unspecified).toBeDefined();
    expect(unspecified.total).toBe(1);
    expect(unspecified.byStatus.unverified).toBe(1);
  });

  it("?domain= 필터로 도메인별 집계", async () => {
    await createReport("집회제보", { sido: "서울", domain: "assembly" }, "4.0.0.1");
    await createReport("선거제보", { sido: "서울", domain: "election" }, "4.0.0.2");

    const asm = (await (await ctx.app.request("/map-stats?domain=assembly")).json()) as MapStats;
    const seoulAsm = asm.items.find((i) => i.sido === "서울")!;
    expect(seoulAsm.total).toBe(1);

    const ele = (await (await ctx.app.request("/map-stats?domain=election")).json()) as MapStats;
    const seoulEle = ele.items.find((i) => i.sido === "서울")!;
    expect(seoulEle.total).toBe(1);

    const all = (await (await ctx.app.request("/map-stats")).json()) as MapStats;
    const seoulAll = all.items.find((i) => i.sido === "서울")!;
    expect(seoulAll.total).toBe(2);
  });

  it("응답에 본문·식별정보·제목이 없다(카운트만)", async () => {
    await createReport("비밀제목", { sido: "서울", body: "민감본문" }, "5.0.0.1");
    const res = await ctx.app.request("/map-stats");
    const text = await res.text();
    expect(text).not.toContain("비밀제목");
    expect(text).not.toContain("민감본문");
    expect(text).not.toContain("submitter");
    expect(text).not.toContain("5.0.0.1");
  });
});
