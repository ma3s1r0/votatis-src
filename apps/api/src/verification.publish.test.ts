import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie: string;

beforeEach(async () => {
  ctx = await setup();
  cookie = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
});

describe("0004 → 0002 공개 노출 연동", () => {
  it("verified=true 판정 직후 공개 조회에 노출", async () => {
    const r = await makeReport(ctx.db, "공개될 제보");

    // 판정 전: 공개 상세 404.
    const before = await ctx.app.request(`/api/reports/${r.id}`);
    expect(before.status).toBe(404);

    // verified=true 판정.
    const post = await ctx.app.request(`/api/admin/reports/${r.id}/verification`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(validVerificationBody({ verified: true })),
    });
    expect(post.status).toBe(201);

    // 판정 후: 공개 상세 200, 공개 목록에 포함.
    const after = await ctx.app.request(`/api/reports/${r.id}`);
    expect(after.status).toBe(200);

    const list = await ctx.app.request("/api/reports");
    const body = (await list.json()) as { items: { id: string }[] };
    expect(body.items.some((i) => i.id === r.id)).toBe(true);
  });

  it("검토 큐는 미검증 제보를 포함(공개 0002 와 가시성 다름)", async () => {
    const r = await makeReport(ctx.db, "미검증 제보");

    // 검토 큐: 포함.
    const queue = await ctx.app.request("/api/admin/reports", {
      headers: { cookie },
    });
    const qbody = (await queue.json()) as { items: { id: string }[] };
    expect(qbody.items.some((i) => i.id === r.id)).toBe(true);

    // 공개 목록: 미포함.
    const pub = await ctx.app.request("/api/reports");
    const pbody = (await pub.json()) as { items: { id: string }[] };
    expect(pbody.items.some((i) => i.id === r.id)).toBe(false);
  });
});
