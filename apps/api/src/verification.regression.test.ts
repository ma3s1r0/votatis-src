import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { verification, verificationHistory, source } from "./db/schema.js";
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

async function counts(reportId: string) {
  const v = await ctx.db
    .select()
    .from(verification)
    .where(eq(verification.reportId, reportId));
  const h = await ctx.db
    .select()
    .from(verificationHistory)
    .where(eq(verificationHistory.reportId, reportId));
  const ev = v[0]
    ? await ctx.db.select().from(source).where(eq(source.verificationId, v[0].id))
    : [];
  return { v, h, ev };
}

// QA 회귀 — 스펙 0004 마지막 수용 기준(enum/스케일 422)의 "레코드 미생성" 측면이
// create.test 에서 status 만 검증되고 DB 부작용은 단언되지 않은 빈틈을 메운다.
describe("QA 회귀 — 0004 범위 위반 422 는 DB 부작용 없음", () => {
  it("생성 경로: confidence 범위 밖 422 → verification 레코드 미생성", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ confidence: 101 }));
    expect(res.status).toBe(422);
    const { v, ev } = await counts(r.id);
    expect(v.length).toBe(0);
    expect(ev.length).toBe(0);
  });

  it("생성 경로: validity enum 밖 422 → 레코드 미생성", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ validity: "maybe" }));
    expect(res.status).toBe(422);
    expect((await counts(r.id)).v.length).toBe(0);
  });

  it("생성 경로: severity 범위 밖 422 → 레코드 미생성", async () => {
    const r = await makeReport(ctx.db);
    const res = await submit(r.id, validVerificationBody({ severity: "9" }));
    expect(res.status).toBe(422);
    expect((await counts(r.id)).v.length).toBe(0);
  });

  it("수정 경로: 기존 판정 위에 범위 밖 값으로 수정 시도 → 422, 기존 판정 불변·이력/근거 증가 없음(파괴 없음)", async () => {
    const r = await makeReport(ctx.db);
    // 최초 유효 판정(version 1, confidence 80, evidence 1개).
    expect((await submit(r.id, validVerificationBody())).status).toBe(201);
    const base = await counts(r.id);
    expect(base.v.length).toBe(1);
    expect(base.h.length).toBe(0);
    expect(base.ev.length).toBe(1);

    // 범위 밖 confidence 로 수정 시도 → 422.
    const res = await submit(r.id, validVerificationBody({ confidence: 200 }));
    expect(res.status).toBe(422);

    // 기존 판정 그대로(confidence 80, version 1), 이력 append 없음, 근거 중복 없음.
    const after = await counts(r.id);
    expect(after.v.length).toBe(1);
    expect(after.v[0].confidence).toBe(80);
    expect(after.v[0].version).toBe(1);
    expect(after.h.length).toBe(0);
    expect(after.ev.length).toBe(1);
  });
});
