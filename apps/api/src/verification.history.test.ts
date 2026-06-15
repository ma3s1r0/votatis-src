import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
} from "./admin.test-helpers.js";
import { verification, verificationHistory } from "./db/schema.js";
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

describe("0004 판정 수정 이력 보존", () => {
  it("수정 시 직전 판정이 이력에 보존되고 최신만 활성", async () => {
    const r = await makeReport(ctx.db);
    // 0017: 동일 reviewer 의 판정 내용 수정(동의 아님 → verified=false)으로 이력 보존을 검증.
    // (verified=true 재제출은 중복 동의 409 이므로 내용 수정엔 verified=false 사용.)
    await submit(
      r.id,
      validVerificationBody({ confidence: 50, validity: "unclear", verified: false }),
    );
    await submit(
      r.id,
      validVerificationBody({ confidence: 90, validity: "valid", verified: false }),
    );

    // 활성 판정은 1행, 최신값.
    const rows = await ctx.db
      .select()
      .from(verification)
      .where(eq(verification.reportId, r.id));
    expect(rows.length).toBe(1);
    expect(rows[0].confidence).toBe(90);
    expect(rows[0].validity).toBe("valid");
    expect(rows[0].version).toBe(2);

    // 이력에 직전(version 1, confidence 50) 보존.
    const hist = await ctx.db
      .select()
      .from(verificationHistory)
      .where(eq(verificationHistory.reportId, r.id));
    expect(hist.length).toBe(1);
    expect(hist[0].version).toBe(1);
    const snap = hist[0].snapshot as { confidence: number; validity: string };
    expect(snap.confidence).toBe(50);
    expect(snap.validity).toBe("unclear");
  });

  it("verified false→true 전환도 근거 없으면 거부(422)", async () => {
    const r = await makeReport(ctx.db);
    // 최초 판정(verified=false) 정상.
    await submit(r.id, validVerificationBody({ verified: false }));
    // 근거 없이 verified=true 로 올리려 하면 거부.
    const res = await submit(r.id, {
      ...validVerificationBody({ verified: true }),
      method: "",
      evidenceLinks: [],
    });
    expect(res.status).toBe(422);
    // 여전히 verified=false 유지(파괴 없음).
    const [v] = await ctx.db
      .select()
      .from(verification)
      .where(eq(verification.reportId, r.id));
    expect(v.verified).toBe(false);
  });
});
