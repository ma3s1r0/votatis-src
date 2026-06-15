import { describe, it, expect, beforeEach } from "vitest";
import {
  setup,
  loginCookie,
  makeReport,
  validVerificationBody,
  REVIEWER_EMAIL,
  REVIEWER_PASSWORD,
  REVIEWER2_EMAIL,
  REVIEWER2_PASSWORD,
} from "./admin.test-helpers.js";

// 0005 공개 아카이브 계약: 공개 상세에 verification 요약 + attachment filename 노출.
// reviewer 신원·내부 감사필드·스토리지 key·expectedSha256·exif 는 비노출.

let ctx: Awaited<ReturnType<typeof setup>>;
let cookie: string;

beforeEach(async () => {
  ctx = await setup();
  cookie = (await loginCookie(ctx.app, REVIEWER_EMAIL, REVIEWER_PASSWORD))!;
});

// 0017: verified=true 확정에는 서로 다른 reviewer 2인 동의가 필요 →
// reviewer1 동의(1/2) 후 reviewer2 동의(2/2)로 공개 노출까지 보강.
async function verify(reportId: string, overrides: Record<string, unknown> = {}) {
  const body = JSON.stringify(validVerificationBody({ verified: true, ...overrides }));
  const r1 = await ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body,
  });
  expect(r1.status).toBe(201);
  const cookie2 = (await loginCookie(ctx.app, REVIEWER2_EMAIL, REVIEWER2_PASSWORD))!;
  const r2 = await ctx.app.request(`/api/admin/reports/${reportId}/verification`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie2 },
    body,
  });
  expect(r2.status).toBe(201);
}

describe("0005 공개 상세 계약 — verification 요약", () => {
  it("공개 상세에 verification 요약 객체 노출(verified/validity/severity/method/notes/unverifiedClaims)", async () => {
    const r = await makeReport(ctx.db, "검증된 제보");
    await verify(r.id, {
      validity: "valid",
      severity: "3",
      method: "현장 사진 대조",
      notes: "공개 노트",
      unverifiedClaims: "투표함 바꿔치기 주장은 미확인",
    });

    const res = await ctx.app.request(`/api/reports/${r.id}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verification: {
        verified: boolean;
        validity: string | null;
        severity: string | null;
        method: string | null;
        notes: string | null;
        unverifiedClaims: string | null;
      };
    };
    expect(json.verification).toBeTruthy();
    expect(json.verification.verified).toBe(true);
    expect(json.verification.validity).toBe("valid");
    // DB 타입 그대로(string) — boolean/number 로 강제 변환하지 않음.
    expect(json.verification.severity).toBe("3");
    expect(typeof json.verification.severity).toBe("string");
    expect(json.verification.method).toBe("현장 사진 대조");
    expect(json.verification.notes).toBe("공개 노트");
    expect(json.verification.unverifiedClaims).toBe("투표함 바꿔치기 주장은 미확인");
  });

  it("공개 상세 verification 에 reviewer 신원·내부 감사필드 비노출", async () => {
    const r = await makeReport(ctx.db, "검증된 제보2");
    await verify(r.id);

    const res = await ctx.app.request(`/api/reports/${r.id}`);
    const body = await res.text();
    expect(body).not.toContain("reviewerId");
    expect(body).not.toContain("reviewer_id");
    expect(body).not.toContain("reviewedAt");
    expect(body).not.toContain("confidence");
  });
});

describe("0014 공개 상세 계약 — domain 직렬화", () => {
  it("assembly 제보의 공개 상세에 domain=assembly 노출", async () => {
    const r = await makeReport(ctx.db, "집회 현장 제보", "assembly");
    await verify(r.id);

    const res = await ctx.app.request(`/api/reports/${r.id}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { domain: string };
    expect(json.domain).toBe("assembly");
  });
});

describe("0005 공개 상세 계약 — attachment filename", () => {
  it("공개 상세 attachments[] 에 filename 포함, 스토리지 key·expectedSha256·exif 제외", async () => {
    const r = await makeReport(ctx.db, "첨부 있는 제보");

    // 첨부 create → finalize(stored).
    const createRes = await ctx.app.request(`/api/reports/${r.id}/attachments/create`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
      body: JSON.stringify({
        filename: "투표함.png",
        mime: "image/png",
        size: 1024,
        sha256: "deadbeef",
      }),
    });
    const { attachmentId, storageKey } = (await createRes.json()) as {
      attachmentId: string;
      storageKey: string;
    };
    ctx.storage.put(storageKey, 1024, "deadbeef");
    await ctx.app.request(`/api/reports/${r.id}/attachments/${attachmentId}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    await verify(r.id);

    const res = await ctx.app.request(`/api/reports/${r.id}`);
    expect(res.status).toBe(200);
    const body = await res.text();
    const json = JSON.parse(body) as {
      attachments: { id: string; filename: string | null; mime: string | null }[];
    };
    expect(json.attachments.length).toBe(1);
    expect(json.attachments[0].filename).toBe("투표함.png");

    expect(body).not.toContain("storageKey");
    expect(body).not.toContain("storage_key");
    expect(body).not.toContain("expectedSha256");
    expect(body).not.toContain("exif");
  });
});

describe("0004 판정 — unverifiedClaims 저장·admin 상세 노출", () => {
  it("판정 입력의 unverifiedClaims 저장 + admin 상세 verification 에 노출", async () => {
    const r = await makeReport(ctx.db, "미확인 주장 포함 제보");
    await verify(r.id, { unverifiedClaims: "CCTV 조작 주장은 미확인" });

    const res = await ctx.app.request(`/api/admin/reports/${r.id}`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      verification: { unverifiedClaims: string | null } | null;
    };
    expect(json.verification).toBeTruthy();
    expect(json.verification!.unverifiedClaims).toBe("CCTV 조작 주장은 미확인");
  });

  it("unverifiedClaims 없어도(근거만 충족) 판정 성공", async () => {
    const r = await makeReport(ctx.db, "미확인 주장 없는 제보");
    await verify(r.id);
    const res = await ctx.app.request(`/api/reports/${r.id}`);
    const json = (await res.json()) as {
      verification: { unverifiedClaims: string | null };
    };
    expect(json.verification.unverifiedClaims).toBeNull();
  });
});
