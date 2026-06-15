import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq } from "./report.test-helpers.js";
import { report } from "./db/schema.js";

const TRACKING_RE = /^VT-\d{4}-\d{4}-\d{4}$/;

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

describe("0013 접수번호 발급", () => {
  // 수용 기준: 생성 응답에 trackingNumber 포함, 형식 정규식 매칭.
  it("POST /reports 응답에 trackingNumber 포함 + 형식 매칭", async () => {
    const res = await ctx.app.request("/reports", jsonReq({ title: "추적번호 제보" }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; status: string; trackingNumber: string };
    expect(json.trackingNumber).toMatch(TRACKING_RE);
  });

  // 수용 기준: 같은 날 연속 생성 2건의 trackingNumber 가 서로 다르고 NNNN 이 증가.
  it("같은 날 2건 → 서로 다름 + NNNN 순증", async () => {
    const r1 = await ctx.app.request("/reports", jsonReq({ title: "첫번째" }));
    const r2 = await ctx.app.request("/reports", jsonReq({ title: "두번째" }));
    const j1 = (await r1.json()) as { trackingNumber: string };
    const j2 = (await r2.json()) as { trackingNumber: string };

    expect(j1.trackingNumber).not.toBe(j2.trackingNumber);

    const seq = (t: string) => Number(t.slice(-4));
    const datePart = (t: string) => t.slice(0, 13); // VT-YYYY-MMDD
    expect(datePart(j2.trackingNumber)).toBe(datePart(j1.trackingNumber));
    expect(seq(j2.trackingNumber)).toBe(seq(j1.trackingNumber) + 1);
  });

  // 수용 기준: trackingNumber 가 report 행에 저장되고 유니크 제약이 있다.
  it("trackingNumber 가 행에 저장 + 유니크 제약(중복 insert 거부)", async () => {
    const res = await ctx.app.request("/reports", jsonReq({ title: "저장 확인" }));
    const { id, trackingNumber } = (await res.json()) as { id: string; trackingNumber: string };

    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));
    expect(row.trackingNumber).toBe(trackingNumber);

    // 동일 번호 직접 재발급 시도는 DB 레벨에서 거부된다.
    await expect(
      ctx.db.insert(report).values({
        title: "충돌",
        collectedAt: new Date(),
        trackingNumber,
      }),
    ).rejects.toThrow();
  });

  // 수용 기준: 날짜 부분이 서버 시각(collected_at) 기준이다.
  it("trackingNumber 날짜부 = collected_at(서버 시각) 기준", async () => {
    const res = await ctx.app.request("/reports", jsonReq({ title: "날짜 확인" }));
    const { id, trackingNumber } = (await res.json()) as { id: string; trackingNumber: string };
    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));

    const d = row.collectedAt;
    const yyyy = String(d.getUTCFullYear());
    const mmdd =
      String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
    expect(trackingNumber.slice(0, 12)).toBe(`VT-${yyyy}-${mmdd}`);
  });
});
