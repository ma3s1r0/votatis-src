import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq, markVerified } from "./report.test-helpers.js";
import { report } from "./db/schema.js";

// QA 회귀(0013) — 공개 누설 점검 강화.
// 기존 public-contract 테스트는 본문 문자열 부분일치(not.toContain)만 단언한다.
// 여기서는 (a) 응답 키 화이트리스트, (b) report uuid 비노출(미검증),
// (c) timeline 항목 키 화이트리스트를 직접 단언해 회귀를 고정한다.

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

async function createTracked(title = "QA 추적", ip = "10.9.9.9") {
  const res = await ctx.app.request("/reports", jsonReq({ title }, ip));
  return (await res.json()) as { id: string; trackingNumber: string };
}

describe("0013 QA — 공개 상태조회 누설 점검(키 계약)", () => {
  it("미검증 응답 키는 {trackingNumber, timeline, currentStage, publicUrl} 로 한정된다", async () => {
    const { trackingNumber } = await createTracked();
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(
      ["currentStage", "publicUrl", "timeline", "trackingNumber"].sort(),
    );
  });

  it("미검증 제보는 응답 어디에도 report uuid 를 노출하지 않는다", async () => {
    const { id, trackingNumber } = await createTracked();
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const body = await res.text();
    // 미검증이면 publicUrl=null 이어야 하고 uuid 가 본문에 새지 않아야 한다.
    expect(body).not.toContain(id);
  });

  it("verified=true 일 때만 publicUrl 에 uuid 가 포함되고, 그 외 키는 늘지 않는다", async () => {
    const { id, trackingNumber } = await createTracked();
    await markVerified(ctx.db, id, true);
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(
      ["currentStage", "publicUrl", "timeline", "trackingNumber"].sort(),
    );
    expect(String(json.publicUrl)).toContain(id);
  });

  it("timeline 각 항목 키는 {stage, label, state} 로 한정된다(추가 메타 누설 없음)", async () => {
    const { trackingNumber } = await createTracked();
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as {
      timeline: Record<string, unknown>[];
    };
    for (const item of json.timeline) {
      expect(Object.keys(item).sort()).toEqual(["label", "stage", "state"].sort());
    }
  });

  it("submitter(IP 해시)는 행에 저장되지만 상태조회 응답에는 새지 않는다", async () => {
    const { id, trackingNumber } = await createTracked("해시확인", "203.0.113.7");
    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));
    expect(row.submitter).toBeTruthy(); // 행에는 해시 저장됨
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const body = await res.text();
    expect(body).not.toContain(row.submitter as string);
    expect(body).not.toContain("203.0.113.7");
  });
});
