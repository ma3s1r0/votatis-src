import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq, markVerified } from "./report.test-helpers.js";
import { reportHistory } from "./db/schema.js";

let ctx: Awaited<ReturnType<typeof setup>>;

async function createReport(title: string, extra: object = {}, ip = "10.0.0.1"): Promise<string> {
  const res = await ctx.app.request("/reports", jsonReq({ title, ...extra }, ip));
  return ((await res.json()) as { id: string }).id;
}

async function detail(id: string) {
  return ctx.app.request(`/reports/${id}`);
}

beforeEach(async () => {
  ctx = await setup();
});

describe("공개 상세 조회수 — viewCount", () => {
  it("첫 조회 viewCount=1, 재조회마다 누적", async () => {
    const id = await createReport("검증됨", {}, "1.1.1.1");
    await markVerified(ctx.db, id);

    const first = (await (await detail(id)).json()) as { viewCount: number };
    expect(first.viewCount).toBe(1);
    const second = (await (await detail(id)).json()) as { viewCount: number };
    expect(second.viewCount).toBe(2);
    const third = (await (await detail(id)).json()) as { viewCount: number };
    expect(third.viewCount).toBe(3);
  });

  it("verified 아닌(404) 제보 조회는 viewCount 미증가", async () => {
    const id = await createReport("미검증", {}, "2.2.2.2");
    const res = await detail(id);
    expect(res.status).toBe(404);

    // 이후 verified 로 전환하면 첫 공개 조회는 1 이어야 한다(404 가 증가 안 시켰음).
    await markVerified(ctx.db, id);
    const ok = (await (await detail(id)).json()) as { viewCount: number };
    expect(ok.viewCount).toBe(1);
  });

  it("존재하지 않는 ID 404 도 증가 없음(에러 아님)", async () => {
    const res = await detail("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("동시 조회는 유실 없이 원자적 누적", async () => {
    const id = await createReport("검증됨", {}, "3.3.3.3");
    await markVerified(ctx.db, id);

    const N = 20;
    await Promise.all(Array.from({ length: N }, () => detail(id)));

    const final = (await (await detail(id)).json()) as { viewCount: number };
    expect(final.viewCount).toBe(N + 1);
  });

  it("조회수 증가는 report_history 를 append 하지 않는다(감사 노이즈 회피)", async () => {
    const id = await createReport("검증됨", {}, "4.4.4.4");
    await markVerified(ctx.db, id);

    for (let i = 0; i < 5; i++) await detail(id);

    const history = await ctx.db
      .select()
      .from(reportHistory)
      .where(eq(reportHistory.reportId, id));
    expect(history).toHaveLength(0);
  });
});
