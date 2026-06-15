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
import { verification, report, verificationApproval } from "./db/schema.js";
import { eq } from "drizzle-orm";

// 0017 핵심 불변식(QA 회귀 보강):
//  - "2인 동의는 정말 서로 다른 사람이어야 함" — 동일인의 2회는 verified 를 올리지 못함.
//  - "확정 후 재판정으로 verified 하향 안 됨" — 2/2 확정 뒤 verified=false 재제출이
//    verified 를 풀지 못한다(append-only·하향 금지).

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie1: string;
let cookie2: string;

beforeEach(async () => {
  ctx = await setup();
  cookie1 = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
  cookie2 = (await loginCookie(ctx.app, REVIEWER2_EMAIL, REVIEWER2_PASSWORD))!;
});

function submit(reportId: string, cookie: string, overrides: Record<string, unknown> = {}) {
  return ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(validVerificationBody(overrides)),
  });
}

describe("0017 불변식 — 서로 다른 2인 강제", () => {
  it("동일 reviewer 단독 2회로는 verified 가 확정되지 않는다(중복 409, 진행도 1/2)", async () => {
    const r = await makeReport(ctx.db);

    expect((await submit(r.id, cookie1, { verified: true })).status).toBe(201);
    // 같은 사람이 두 번째 동의 시도 → 409, verified 미확정.
    expect((await submit(r.id, cookie1, { verified: true })).status).toBe(409);

    const [v] = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    expect(v.verified).toBe(false);

    const approvals = await ctx.db
      .select()
      .from(verificationApproval)
      .where(eq(verificationApproval.verificationId, v.id));
    expect(approvals.length).toBe(1);

    const [rep] = await ctx.db.select().from(report).where(eq(report.id, r.id));
    expect(rep.vVerified ?? false).toBe(false);
    expect((await ctx.app.request(`/api/reports/${r.id}`)).status).toBe(404);
  });
});

describe("0017 불변식 — 확정 후 하향 금지", () => {
  it("2/2 확정 후 verified=false 재제출이 verified 를 풀지 못한다(공개 유지)", async () => {
    const r = await makeReport(ctx.db);

    await submit(r.id, cookie1, { verified: true });
    const second = await submit(r.id, cookie2, { verified: true });
    expect(second.status).toBe(201);

    // 확정 상태 확인.
    let [v] = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    expect(v.verified).toBe(true);

    // reviewer1 이 verified=false 로 판정 내용만 재제출(동의 철회 의도).
    const re = await submit(r.id, cookie1, { verified: false, notes: "재검토" });
    expect(re.status).toBe(201);

    // verified 는 유지되어야 한다(하향 금지).
    [v] = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    expect(v.verified).toBe(true);

    const [rep] = await ctx.db.select().from(report).where(eq(report.id, r.id));
    expect(rep.vVerified).toBe(true);

    // 공개 노출 유지.
    expect((await ctx.app.request(`/api/reports/${r.id}`)).status).toBe(200);
  });
});
