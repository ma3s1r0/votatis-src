import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";
import { InMemoryStorage } from "./storage.js";
import { makeTestDb } from "./db/test-db.js";

// 엔트리 구성 함수(buildApp)가 fake db/storage·CORS 설정으로 앱을 만들어
// /health 200 + 각 prefix 라우트를 마운트하는지 검증. 실 드라이버 미사용.
describe("buildApp (엔트리 구성)", () => {
  it("/health 는 DB·구성과 무관하게 200", async () => {
    const db = await makeTestDb();
    const app = buildApp({
      db,
      storage: new InMemoryStorage(),
      corsOrigins: ["https://app.votatis.test"],
    });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "votatis-api" });
  });

  it("auth/공개/admin prefix 라우트가 마운트됨(404 아님)", async () => {
    const db = await makeTestDb();
    const app = buildApp({
      db,
      storage: new InMemoryStorage(),
      corsOrigins: ["https://app.votatis.test"],
    });
    // admin 은 인증 가드 → 미인증 401(라우트는 존재). 404 가 아니어야 함.
    const adminRes = await app.request("/api/admin/reports");
    expect(adminRes.status).not.toBe(404);
    // auth 라우트 존재
    const authRes = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(authRes.status).not.toBe(404);
  });

  it("CORS: 명시 오리진 허용 + credentials, 와일드카드 아님", async () => {
    const db = await makeTestDb();
    const app = buildApp({
      db,
      storage: new InMemoryStorage(),
      corsOrigins: ["https://app.votatis.test"],
    });
    const res = await app.request("/health", {
      headers: { Origin: "https://app.votatis.test" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://app.votatis.test",
    );
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("CORS: 허용 목록 밖 오리진은 그 오리진을 반사하지 않음", async () => {
    const db = await makeTestDb();
    const app = buildApp({
      db,
      storage: new InMemoryStorage(),
      corsOrigins: ["https://app.votatis.test"],
    });
    const res = await app.request("/health", {
      headers: { Origin: "https://evil.test" },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe(
      "https://evil.test",
    );
  });
});
