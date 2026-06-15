import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { verification } from "./db/schema.js";
import { eq } from "drizzle-orm";

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie: string;

beforeEach(async () => {
  ctx = await setup();
  cookie = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
});

async function submit(reportId: string, body: unknown) {
  return ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function verificationCount(reportId: string) {
  const rows = await ctx.db
    .select()
    .from(verification)
    .where(eq(verification.reportId, reportId));
  return rows.length;
}

describe("0004 근거 강제(서버 권위)", () => {
  it("method 없음 → 422, 레코드 미생성", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ method: "" }));
    expect(res.status).toBe(422);
    expect(await verificationCount(r.id)).toBe(0);
  });

  it("evidence 0개 → 422, 레코드 미생성", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ evidenceLinks: [] }));
    expect(res.status).toBe(422);
    expect(await verificationCount(r.id)).toBe(0);
  });

  it("method·evidence 둘 다 없음 → 422", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(
      r.id,
      validVerificationBody({ method: "", evidenceLinks: [] }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { fields: { field: string }[] };
    const fields = body.fields.map((f) => f.field);
    expect(fields).toContain("method");
    expect(fields).toContain("evidence_links");
    expect(await verificationCount(r.id)).toBe(0);
  });

  it("evidence 의 content_hash/captured_at 누락 → 유효 근거 아님 → 422", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(
      r.id,
      validVerificationBody({
        evidenceLinks: [{ url: "https://example.com/x" }],
      }),
    );
    expect(res.status).toBe(422);
    expect(await verificationCount(r.id)).toBe(0);
  });
});
