import { describe, it, expect, beforeEach } from "vitest";
import { setup, jsonReq } from "./report.test-helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

describe("0013 상태조회 직렬화 계약 — 민감정보 비노출", () => {
  it("track 응답에 본문·submitter·sources·reviewer·내부 status 원문 등 민감필드 없음", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({
        title: "민감정보 노출 안됨",
        body: "이 본문은 상태조회에 노출되면 안 된다",
        sources: [
          {
            kind: "url",
            url: "https://secret.example/source",
            capturedAt: "2026-06-15T00:00:00Z",
            contentHash: "secrethash",
          },
        ],
      }),
    );
    const { trackingNumber } = (await res.json()) as { trackingNumber: string };

    const lookup = await ctx.app.request(`/track/${trackingNumber}`);
    const body = await lookup.text();

    // 본문·출처·제보자 해시·내부 status 원문·reviewer 신원 비노출.
    expect(body).not.toContain("이 본문은 상태조회에 노출되면 안 된다");
    expect(body).not.toContain("secret.example");
    expect(body).not.toContain("secrethash");
    expect(body).not.toContain("submitter");
    expect(body).not.toContain("reviewer");
    expect(body).not.toContain("\"body\"");
    expect(body).not.toContain("sources");
    // 내부 status 원문(submitted) 키 비노출 — 공개 단계 라벨만 노출.
    expect(body).not.toContain("\"status\"");
  });
});
