import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { verification, verificationApproval } from "./db/schema.js";
import { eq } from "drizzle-orm";

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie1: string;

beforeEach(async () => {
  ctx = await setup();
  cookie1 = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
});

function approve(reportId: string, cookie: string, body: unknown) {
  return ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

describe("0017 동의 근거 강제 — method/evidence 없는 동의는 거부(0004 유지)", () => {
  it("method 없는 동의 → 422, 동의 미기록", async () => {
    const r = await makeReport(ctx.db);
    const res = await approve(
      r.id,
      cookie1,
      validVerificationBody({ verified: true, method: "" }),
    );
    expect(res.status).toBe(422);

    const v = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    expect(v.length).toBe(0);
  });

  it("evidence 없는 동의 → 422, 동의 미기록", async () => {
    const r = await makeReport(ctx.db);
    const res = await approve(
      r.id,
      cookie1,
      validVerificationBody({ verified: true, evidenceLinks: [] }),
    );
    expect(res.status).toBe(422);

    const v = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    if (v.length > 0) {
      const approvals = await ctx.db
        .select()
        .from(verificationApproval)
        .where(eq(verificationApproval.verificationId, v[0].id));
      expect(approvals.length).toBe(0);
    } else {
      expect(v.length).toBe(0);
    }
  });
});
