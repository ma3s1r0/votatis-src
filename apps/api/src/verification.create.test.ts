import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { verification, report, source } from "./db/schema.js";
import { eq, and } from "drizzle-orm";

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

describe("0004 정상 판정", () => {
  it("유효 판정 → verification 필드·reviewer·reviewed_at 기록", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody());
    expect(res.status).toBe(201);

    const [v] = await ctx.db
      .select()
      .from(verification)
      .where(eq(verification.reportId, r.id));
    expect(v.confidence).toBe(80);
    expect(v.validity).toBe("valid");
    expect(v.severity).toBe("3");
    expect(v.verified).toBe(true);
    expect(v.method).toBeTruthy();
    expect(v.reviewerId).toBe(ctx.reviewer.id);
    expect(v.reviewedAt).toBeInstanceOf(Date);
  });

  it("report.v_* 미러링 + v_verified 반영", async () => {
    const r = await makeReport(ctx.db);
    await submit(r.id, validVerificationBody());
    const [rep] = await ctx.db.select().from(report).where(eq(report.id, r.id));
    expect(rep.vVerified).toBe(true);
    expect(rep.vValidity).toBe("valid");
    expect(rep.vConfidence).toBe(80);
  });

  it("evidence 가 source(kind=url, captured_at·content_hash) 로 보관됨", async () => {
    const r = await makeReport(ctx.db);
    await submit(r.id, validVerificationBody());
    const [v] = await ctx.db
      .select()
      .from(verification)
      .where(eq(verification.reportId, r.id));
    const ev = await ctx.db
      .select()
      .from(source)
      .where(and(eq(source.verificationId, v.id), eq(source.kind, "url")));
    expect(ev.length).toBe(1);
    expect(ev[0].contentHash).toBe("abc123");
    expect(ev[0].capturedAt).toBeInstanceOf(Date);
  });

  it("confidence 범위 밖(101) → 422", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ confidence: 101 }));
    expect(res.status).toBe(422);
  });

  it("validity enum 밖 → 422", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ validity: "maybe" }));
    expect(res.status).toBe(422);
  });

  it("severity 범위 밖(9) → 422", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ severity: "9" }));
    expect(res.status).toBe(422);
  });

  it("존재하지 않는 report → 404", async () => {
    const res = await submit("00000000-0000-0000-0000-000000000000", validVerificationBody());
    expect(res.status).toBe(404);
  });
});
