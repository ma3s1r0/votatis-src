import { describe, it, expect, beforeEach } from "vitest";
import { setup, jsonReq, markVerified, seedElection } from "./report.test-helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;

async function createReport(title: string, extra: object = {}, ip = "10.0.0.1"): Promise<string> {
  const res = await ctx.app.request("/reports", jsonReq({ title, ...extra }, ip));
  return ((await res.json()) as { id: string }).id;
}

beforeEach(async () => {
  ctx = await setup();
});

describe("공개 조회 — verified=true 만", () => {
  it("목록은 verified=true 인 것만 노출", async () => {
    const verifiedId = await createReport("검증됨", {}, "1.1.1.1");
    await createReport("미검증", {}, "2.2.2.2");
    await markVerified(ctx.db, verifiedId);

    const res = await ctx.app.request("/reports");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: { id: string; title: string }[]; total: number };
    expect(json.total).toBe(1);
    expect(json.items.map((i) => i.id)).toEqual([verifiedId]);
  });

  it("상세 — 검증됨 200, 미검증 ID 는 404", async () => {
    const verifiedId = await createReport("검증됨", {}, "3.3.3.3");
    const unverifiedId = await createReport("미검증", {}, "4.4.4.4");
    await markVerified(ctx.db, verifiedId);

    const ok = await ctx.app.request(`/reports/${verifiedId}`);
    expect(ok.status).toBe(200);

    const notVerified = await ctx.app.request(`/reports/${unverifiedId}`);
    expect(notVerified.status).toBe(404);
  });

  it("존재하지 않는 ID → 404", async () => {
    const res = await ctx.app.request(
      "/reports/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });

  // 수용 기준: 공개 응답에 submitter 해시·원 IP 등 민감 필드 비노출.
  it("공개 응답에 submitter/원 IP 등 민감 필드 없음", async () => {
    const id = await createReport("검증됨", {}, "5.5.5.5");
    await markVerified(ctx.db, id);

    const detail = await ctx.app.request(`/reports/${id}`);
    const body = await detail.text();
    expect(body).not.toContain("submitter");
    expect(body).not.toContain("5.5.5.5");
    expect(body).not.toContain("v_verified");
    expect(body).not.toContain("vVerified");

    const list = await ctx.app.request("/reports");
    const listBody = await list.text();
    expect(listBody).not.toContain("submitter");
  });

  // 0005 의존: 페이지네이션(limit/offset).
  it("페이지네이션 limit/offset", async () => {
    for (let i = 0; i < 3; i++) {
      const id = await createReport(`r${i}`, {}, `7.7.7.${i}`);
      await markVerified(ctx.db, id);
    }
    const page1 = await ctx.app.request("/reports?limit=2&offset=0");
    const j1 = (await page1.json()) as { items: unknown[]; total: number };
    expect(j1.total).toBe(3);
    expect(j1.items.length).toBe(2);

    const page2 = await ctx.app.request("/reports?limit=2&offset=2");
    const j2 = (await page2.json()) as { items: unknown[] };
    expect(j2.items.length).toBe(1);
  });

  // 0005 의존: q 검색(제목/본문).
  it("q 검색은 제목/본문 부분일치", async () => {
    const a = await createReport("부정선거 의혹", { body: "투표함" }, "8.8.8.1");
    const b = await createReport("정상 진행", { body: "이상 없음" }, "8.8.8.2");
    await markVerified(ctx.db, a);
    await markVerified(ctx.db, b);

    const res = await ctx.app.request("/reports?q=부정");
    const json = (await res.json()) as { items: { id: string }[]; total: number };
    expect(json.total).toBe(1);
    expect(json.items[0].id).toBe(a);
  });
});

describe("0007 공개 필터 — category·election", () => {
  it("category 필터는 verified 범위 내 해당 category 만", async () => {
    const a = await createReport("투개표 제보", { category: "투개표" }, "11.0.0.1");
    const b = await createReport("사전투표 제보", { category: "사전투표" }, "11.0.0.2");
    await markVerified(ctx.db, a);
    await markVerified(ctx.db, b);

    const res = await ctx.app.request("/reports?category=투개표");
    const json = (await res.json()) as { items: { id: string }[]; total: number };
    expect(json.total).toBe(1);
    expect(json.items[0].id).toBe(a);
  });

  it("electionId 필터는 verified 범위 내 해당 선거 만", async () => {
    const e1 = await seedElection(ctx.db, "선거1");
    const e2 = await seedElection(ctx.db, "선거2");
    const a = await createReport("선거1 제보", { electionId: e1.id }, "12.0.0.1");
    const b = await createReport("선거2 제보", { electionId: e2.id }, "12.0.0.2");
    await markVerified(ctx.db, a);
    await markVerified(ctx.db, b);

    const res = await ctx.app.request(`/reports?electionId=${e1.id}`);
    const json = (await res.json()) as { items: { id: string }[]; total: number };
    expect(json.total).toBe(1);
    expect(json.items[0].id).toBe(a);
  });

  it("q+sido+category 조합은 AND 로 좁힌다", async () => {
    const target = await createReport(
      "부정 의혹",
      { body: "투표함", sido: "서울", category: "투개표" },
      "13.0.0.1",
    );
    // category 다름
    const other1 = await createReport(
      "부정 의혹",
      { body: "투표함", sido: "서울", category: "사전투표" },
      "13.0.0.2",
    );
    // sido 다름
    const other2 = await createReport(
      "부정 의혹",
      { body: "투표함", sido: "부산", category: "투개표" },
      "13.0.0.3",
    );
    // q 불일치
    const other3 = await createReport(
      "정상",
      { body: "이상없음", sido: "서울", category: "투개표" },
      "13.0.0.4",
    );
    for (const id of [target, other1, other2, other3]) await markVerified(ctx.db, id);

    const res = await ctx.app.request("/reports?q=부정&sido=서울&category=투개표");
    const json = (await res.json()) as { items: { id: string }[]; total: number };
    expect(json.total).toBe(1);
    expect(json.items[0].id).toBe(target);
  });

  it("목록 item·상세에 category·election 직렬화", async () => {
    const e = await seedElection(ctx.db, "제8회 지선", "지선");
    const id = await createReport("직렬화 제보", { category: "개표참관", electionId: e.id }, "14.0.0.1");
    await markVerified(ctx.db, id);

    const list = await ctx.app.request("/reports");
    const listJson = (await list.json()) as {
      items: { id: string; category: string | null; electionId: string | null }[];
    };
    const item = listJson.items.find((i) => i.id === id)!;
    expect(item.category).toBe("개표참관");
    expect(item.electionId).toBe(e.id);

    const detail = await ctx.app.request(`/reports/${id}`);
    const detailJson = (await detail.json()) as {
      category: string | null;
      election: { id: string; name: string } | null;
    };
    expect(detailJson.category).toBe("개표참관");
    expect(detailJson.election).toEqual({ id: e.id, name: "제8회 지선" });
  });

  it("election 없는 상세는 election=null", async () => {
    const id = await createReport("선거 없음", { category: "기타" }, "14.0.0.2");
    await markVerified(ctx.db, id);
    const detail = await ctx.app.request(`/reports/${id}`);
    const json = (await detail.json()) as { election: unknown };
    expect(json.election).toBeNull();
  });
});

describe("0007 GET /elections — 필터 옵션", () => {
  it("seeded election 목록 반환", async () => {
    const e = await seedElection(ctx.db, "제8회 지선", "지선");
    const res = await ctx.app.request("/elections");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: { id: string; name: string; type: string }[];
    };
    const found = json.items.find((i) => i.id === e.id);
    expect(found).toEqual({ id: e.id, name: "제8회 지선", type: "지선" });
  });
});
