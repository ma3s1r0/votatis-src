import { describe, it, expect, beforeEach } from "vitest";
import { setup, jsonReq, ROOT_EMAIL, ROOT_PASSWORD } from "./auth.test-helpers.js";

let ctx: Awaited<ReturnType<typeof setup>>;

beforeEach(async () => {
  ctx = await setup();
});

describe("로그인", () => {
  // 수용 기준: 정상 로그인 → httpOnly·Secure·SameSite=Lax 쿠키 발급.
  it("정상 로그인 → httpOnly·Secure·SameSite=Lax 세션 쿠키", async () => {
    const res = await ctx.app.request("/login", jsonReq({ email: ROOT_EMAIL, password: ROOT_PASSWORD }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/votatis_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  // 수용 기준: 틀린 비번/없는 이메일 → 401, 동일 메시지(계정 존재 누설 금지).
  it("틀린 비번과 없는 이메일은 동일한 401 응답", async () => {
    const wrongPw = await ctx.app.request("/login", jsonReq({ email: ROOT_EMAIL, password: "nope" }));
    const noUser = await ctx.app.request("/login", jsonReq({ email: "ghost@votatis.test", password: "nope" }));
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPw.json()).toEqual(await noUser.json());
  });

  // 수용 기준: 로그인 시도 rate limit (IP+계정). 임계 초과 → 429.
  it("동일 IP+계정 임계 초과 → 429", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await ctx.app.request("/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({ email: ROOT_EMAIL, password: "wrong" }),
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
