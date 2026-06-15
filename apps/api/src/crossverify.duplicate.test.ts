import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { verification, report } from "./db/schema.js";
import { eq } from "drizzle-orm";

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie1: string;

beforeEach(async () => {
  ctx = await setup();
  cookie1 = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
});

function approve(reportId: string, cookie: string) {
  return ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(validVerificationBody({ verified: true })),
  });
}

describe("0017 중복 동의 거부 — 동일 reviewer 재동의는 409·진행도 불변", () => {
  it("같은 reviewer 가 또 동의 → 409, 진행도 1/2 유지, verified 미확정", async () => {
    const r = await makeReport(ctx.db);

    const first = await approve(r.id, cookie1);
    expect(first.status).toBe(201);

    const dup = await approve(r.id, cookie1);
    expect(dup.status).toBe(409);

    const [v] = await ctx.db.select().from(verification).where(eq(verification.reportId, r.id));
    expect(v.verified).toBe(false);
    const [rep] = await ctx.db.select().from(report).where(eq(report.id, r.id));
    expect(rep.vVerified ?? false).toBe(false);

    // 공개 비노출.
    const pub = await ctx.app.request(`/api/reports/${r.id}`);
    expect(pub.status).toBe(404);
  });
});
