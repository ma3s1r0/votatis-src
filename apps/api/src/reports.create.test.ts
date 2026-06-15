import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { setup, jsonReq, seedElection } from "./report.test-helpers.js";
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

  // 0007 수용 기준: category·electionId 저장(둘 다 선택 필드).
  it("category·electionId 저장 → 201", async () => {
    const election = await seedElection(ctx.db);
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "분류 있는 제보", category: "투개표", electionId: election.id }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));
    expect(row.category).toBe("투개표");
    expect(row.electionId).toBe(election.id);
  });

  // 0007 수용 기준: category·electionId 누락도 생성 성공(선택 필드).
  it("category·electionId 둘 다 누락 → 201", async () => {
    const res = await ctx.app.request("/reports", jsonReq({ title: "분류 없는 제보" }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));
    expect(row.category).toBeNull();
    expect(row.electionId).toBeNull();
  });

  // 0007 수용 기준: 허용 외 category → 400 + 필드 표기(500 아님).
  it("허용 외 category → 400 + 필드 표기", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "잘못된 분류", category: "허용안됨" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(json.error).toBe("validation_error");
    expect(json.fields.category).toBeTruthy();
  });

  // 0007 수용 기준: 존재하지 않는 electionId → FK 500 대신 400.
  it("존재하지 않는 electionId → 400", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({
        title: "없는 선거",
        electionId: "00000000-0000-0000-0000-000000000000",
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(json.error).toBe("validation_error");
    expect(json.fields.electionId).toBeTruthy();
  });

  // 0014 수용 기준: domain 미지정 → election 으로 저장.
  it("domain 미지정 → election 기본 저장", async () => {
    const res = await ctx.app.request("/reports", jsonReq({ title: "도메인 없는 제보" }));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));
    expect(row.domain).toBe("election");
  });

  // 0014 수용 기준: domain=assembly 저장.
  it("domain=assembly 저장 → 201", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "집회 현장 제보", domain: "assembly" }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));
    expect(row.domain).toBe("assembly");
  });

  // 0014 수용 기준: 허용 외 domain → 400 + fields.domain.
  it("허용 외 domain → 400 + fields.domain", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "잘못된 도메인", domain: "protest" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(json.error).toBe("validation_error");
    expect(json.fields.domain).toBe("invalid");
  });

  // 0014 결정 3: assembly 분류는 assembly 도메인에서 허용.
  it("domain=assembly + assembly 분류 → 201", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "충돌 제보", domain: "assembly", category: "충돌·물리력" }),
    );
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const [row] = await ctx.db.select().from(report).where(eq(report.id, id));
    expect(row.category).toBe("충돌·물리력");
  });

  // 0014 결정 2: election 전용 분류를 assembly 로 보내면 400.
  it("domain=assembly + election 전용 분류 → 400", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "도메인-분류 불일치", domain: "assembly", category: "사전투표" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { fields: Record<string, string> };
    expect(json.fields.category).toBeTruthy();
  });

  // 0014 결정 2(역방향): assembly 전용 분류를 election(기본 포함) 으로 보내면 400.
  it("domain=election + assembly 전용 분류 → 400", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "역방향 도메인-분류 불일치", domain: "election", category: "충돌·물리력" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { fields: Record<string, string> };
    expect(json.fields.category).toBeTruthy();
  });

  // 0014 결정 2(역방향, domain 생략 → election 기본): assembly 전용 분류 → 400.
  it("domain 생략 + assembly 전용 분류 → 400(기본 election 적용)", async () => {
    const res = await ctx.app.request(
      "/reports",
      jsonReq({ title: "기본 도메인 분류 불일치", category: "채증·촬영" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { fields: Record<string, string> };
    expect(json.fields.category).toBeTruthy();
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
