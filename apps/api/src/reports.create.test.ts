import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq } from "./report.test-helpers.js";
import { report } from "./db/schema.js";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

describe("제보 생성", () => {
  // 수용 기준: 성공 시 status=submitted, collected_at 자동, submitter 해시 저장, report_id 반환.
  it("정상 생성 → 201, collected_at 자동·status=submitted·submitter 해시", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "투표소 이상", body: "줄이 길었다", sido: "서울" }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; status: string };
    expect(json.status).toBe("submitted");
    expect(json.id).toBeTruthy();

    const [row] = await ctx.db.select().from(report).where(eq(report.id, json.id));
    expect(row.collectedAt).toBeInstanceOf(Date);
    expect(row.status).toBe("submitted");
    // submitter 는 원 IP 가 아니라 해시여야 한다.
    expect(row.submitter).toBeTruthy();
    expect(row.submitter).not.toContain("10.0.0.1");
  });

  // 수용 기준: 필수 필드 누락 → 400 + 어떤 필드인지.
  it("title 누락 → 400 + 필드 표기", async () => {
    const res = await ctx.app.request("/reports", jsonReq({ body: "내용만" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(json.error).toBe("validation_error");
    expect(json.fields.title).toBeTruthy();
  });

  // 수용 기준: captured_at + content_hash 없는 source 는 거부(400).
  it("captured_at/content_hash 없는 source → 400", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "출처있음", sources: [{ kind: "url", url: "https://x" }] }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { fields: Record<string, string> };
    expect(json.fields["sources.0.contentHash"]).toBeTruthy();
    expect(json.fields["sources.0.capturedAt"]).toBeTruthy();
  });

  // 수용 기준: 정상 source 동반 생성 시 0001 규칙대로 저장.
  it("captured_at+content_hash 동반 source → 201", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({
        title: "출처있음",
        sources: [
          {
            kind: "url",
            url: "https://x",
            capturedAt: "2026-06-15T00:00:00Z",
            contentHash: "abc123",
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
  });

  // 수용 기준: 동일 IP rate limit → 429.
  it("동일 IP 임계 초과 → 429", async () => {
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const res = await ctx.app.request(
        "/reports",
        jsonReq({ title: `t${i}` }, "9.9.9.9"),
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
