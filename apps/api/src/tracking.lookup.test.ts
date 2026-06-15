import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq, markVerified } from "./report.test-helpers.js";
import { report } from "./db/schema.js";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

// 추적번호 발급 + report id 확보.
async function createTracked(title = "추적 제보", ip = "10.0.0.1") {
  const res = await ctx.app.request("/reports", jsonReq({ title }, ip));
  const json = (await res.json()) as { id: string; trackingNumber: string };
  return json;
}

async function setStatus(id: string, status: string) {
  await ctx.db.update(report).set({ status }).where(eq(report.id, id));
}

describe("0013 공개 상태조회 GET /track/:number", () => {
  // 수용 기준: 인증 없이 호출 가능, 존재하면 trackingNumber/timeline/currentStage 반환.
  it("인증 없이 조회 → trackingNumber·timeline·currentStage 반환", async () => {
    const { trackingNumber } = await createTracked();
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      trackingNumber: string;
      timeline: { stage: string; label: string; state: string }[];
      currentStage: string;
    };
    expect(json.trackingNumber).toBe(trackingNumber);
    // 4단계 고정.
    expect(json.timeline).toHaveLength(4);
    expect(json.timeline.map((t) => t.stage)).toEqual([
      "received",
      "reviewing",
      "verified",
      "published",
    ]);
    // submitted → 접수됨(received)이 현재.
    expect(json.currentStage).toBe("received");
  });

  // 수용 기준: status 매핑(여러 status) — 결정 3 표대로.
  it("status 매핑: reviewing → 검수중", async () => {
    const { id, trackingNumber } = await createTracked();
    await setStatus(id, "reviewing");
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as { currentStage: string };
    expect(json.currentStage).toBe("reviewing");
  });

  it("status 매핑: confirmed → 검증완료", async () => {
    const { id, trackingNumber } = await createTracked();
    await setStatus(id, "confirmed");
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as { currentStage: string };
    expect(json.currentStage).toBe("verified");
  });

  it("status 매핑: 미지 status → 접수됨 폴백", async () => {
    const { id, trackingNumber } = await createTracked();
    await setStatus(id, "some-future-status");
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as { currentStage: string };
    expect(json.currentStage).toBe("received");
  });

  // 수용 기준: v_verified=true → 공개 단계 + publicUrl 포함.
  it("verified=true → currentStage=published + publicUrl 포함", async () => {
    const { id, trackingNumber } = await createTracked();
    await markVerified(ctx.db, id, true);
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as { currentStage: string; publicUrl: string | null };
    expect(json.currentStage).toBe("published");
    expect(json.publicUrl).toBeTruthy();
    expect(json.publicUrl).toContain(id);
  });

  // 수용 기준: verified 아니면 publicUrl null/미포함.
  it("verified 아님 → publicUrl null", async () => {
    const { trackingNumber } = await createTracked();
    const res = await ctx.app.request(`/track/${trackingNumber}`);
    const json = (await res.json()) as { publicUrl: string | null };
    expect(json.publicUrl ?? null).toBeNull();
  });

  // 수용 기준: 없는/형식 불일치 번호 → 404.
  it("없는 번호 → 404", async () => {
    const res = await ctx.app.request("/track/VT-2026-0615-9999");
    expect(res.status).toBe(404);
  });

  it("형식 불일치 번호 → 404", async () => {
    const res = await ctx.app.request("/track/not-a-tracking-number");
    expect(res.status).toBe(404);
  });

  // 수용 기준: IP rate limit 초과 시 429.
  it("동일 IP 임계 초과 → 429", async () => {
    const { trackingNumber } = await createTracked("rl", "8.8.8.8");
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const res = await ctx.app.request(`/track/${trackingNumber}`, {
        headers: { "x-forwarded-for": "7.7.7.7" },
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
