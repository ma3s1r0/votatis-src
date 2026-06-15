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
import { verification, verificationApproval } from "./db/schema.js";
import { eq, asc } from "drizzle-orm";

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie1: string;
let cookie2: string;

beforeEach(async () => {
  ctx = await setup();
  cookie1 = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
  cookie2 = (await loginCookie(ctx.app, REVIEWER2_EMAIL, REVIEWER2_PASSWORD))!;
});

function approve(reportId: string, cookie: string) {
  return ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(validVerificationBody({ verified: true })),
  });
}

describe("0017 동의 이력 보존 — reviewer·시각 기록(append-only)", () => {
  it("2인 동의 후 verification_approval 에 각 reviewer·approved_at 기록", async () => {
    const r = await makeReport(ctx.db);
    await approve(r.id, cookie1);
    await approve(r.id, cookie2);

    const [v] = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    const approvals = await ctx.db
      .select()
      .from(verificationApproval)
      .where(eq(verificationApproval.verificationId, v.id))
      .orderBy(asc(verificationApproval.approvedAt));

    expect(approvals.length).toBe(2);
    const reviewerIds = approvals.map((a) => a.reviewerId);
    expect(reviewerIds).toContain(ctx.reviewer.id);
    expect(reviewerIds).toContain(ctx.reviewer2.id);
    for (const a of approvals) {
      expect(a.approvedAt).toBeInstanceOf(Date);
      expect(a.reportId).toBe(r.id);
    }
  });
});
