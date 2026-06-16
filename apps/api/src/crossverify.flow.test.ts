import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
  REVIEWER2_EMAIL,
  REVIEWER2_PASSWORD,
} from "./admin.test-helpers.js";
import { verification, report } from "./db/schema.js";
import { eq } from "drizzle-orm";

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie1: string;
let cookie2: string;

beforeEach(async () => {
  ctx = await setup();
  cookie1 = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
  cookie2 = (await loginCookie(ctx.app, REVIEWER2_EMAIL, REVIEWER2_PASSWORD))!;
});

function approve(reportId: string, cookie: string, overrides: Record<string, unknown> = {}) {
  return ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(validVerificationBody({ verified: true, ...overrides })),
  });
}

describe("0017 교차검증 플로우 — 서로 다른 2인 동의로 verified 확정", () => {
  it("1인 동의 → verified=false·비공개·진행도 1/2", async () => {
    const r = await makeReport(ctx.db, "교차검증 대상");

    const res = await approve(r.id, cookie1);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { verified: boolean; approvals: number; required: number };
    expect(body.verified).toBe(false);
    expect(body.approvals).toBe(1);
    expect(body.required).toBe(2);

    // DB: verification.verified=false, report.vVerified 미확정(공개 게이트 off).
    const [v] = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    expect(v.verified).toBe(false);
    const [rep] = await ctx.db.select().from(report).where(eq(report.id, r.id));
    expect(rep.vVerified ?? false).toBe(false);

    // 공개 조회 비노출.
    const pub = await ctx.app.request(`/api/reports/${r.id}`);
    expect(pub.status).toBe(404);
  });

  it("서로 다른 2인째 동의 → verified=true·공개 노출·진행도 2/2", async () => {
    const r = await makeReport(ctx.db, "공개될 교차검증");

    await approve(r.id, cookie1);
    const res2 = await approve(r.id, cookie2);
    expect(res2.status).toBe(201);
    const body = (await res2.json()) as { verified: boolean; approvals: number; required: number };
    expect(body.verified).toBe(true);
    expect(body.approvals).toBe(2);
    expect(body.required).toBe(2);

    const [v] = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    expect(v.verified).toBe(true);
    const [rep] = await ctx.db.select().from(report).where(eq(report.id, r.id));
    expect(rep.vVerified).toBe(true);

    // 공개 노출.
    const pub = await ctx.app.request(`/api/reports/${r.id}`);
    expect(pub.status).toBe(200);
    const list = await ctx.app.request("/api/reports");
    const lbody = (await list.json()) as { items: { id: string }[] };
    expect(lbody.items.some((i) => i.id === r.id)).toBe(true);
  });

  it("관리 상세에 동의 진행도(approvals/required/verified)와 동의자 표시", async () => {
    const r = await makeReport(ctx.db);
    await approve(r.id, cookie1);

    const detail = await ctx.app.request(`/api/admin/reports/${r.id}`, {
      headers: { cookie: cookie1 },
    });
    expect(detail.status).toBe(200);
    const json = (await detail.json()) as {
      verified: boolean;
      crossVerification: { approvals: number; required: number; approvers: string[] };
    };
    expect(json.crossVerification.required).toBe(2);
    expect(json.crossVerification.approvals).toBe(1);
    expect(json.crossVerification.approvers).toContain(ctx.reviewer.id);
    expect(json.verified).toBe(false);
  });

  // 회귀: 1인 동의(1/2, vVerified=false)한 제보가 검수 큐에서 사라지면 안 된다.
  // (큐 필터가 isNull(vVerified) 였을 때 1명 승인 후 큐에서 누락되던 버그)
  it("1인 동의(1/2)한 제보도 검수 큐에 계속 보인다", async () => {
    const r = await makeReport(ctx.db, "1/2 진행 중 제보");
    await approve(r.id, cookie1); // 1/2 (verified=false)

    const after = await ctx.app.request("/api/admin/reports", {
      headers: { cookie: cookie1 },
    });
    const body = (await after.json()) as { items: { id: string }[] };
    expect(body.items.some((i) => i.id === r.id)).toBe(true);
  });

  // 보강: 2/2 확정된 제보는 검수 큐에서 빠진다(공개로 이동).
  it("2/2 확정된 제보는 검수 큐에서 빠진다", async () => {
    const r = await makeReport(ctx.db, "2/2 확정 제보");
    await approve(r.id, cookie1);
    await approve(r.id, cookie2);

    const after = await ctx.app.request("/api/admin/reports", {
      headers: { cookie: cookie1 },
    });
    const body = (await after.json()) as { items: { id: string }[] };
    expect(body.items.some((i) => i.id === r.id)).toBe(false);
  });
});
