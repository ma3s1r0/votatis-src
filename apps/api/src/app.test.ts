import { describe, it, expect } from "vitest";
import app from "./app.js";

describe("votatis-api", () => {
  it("GET /health → 200 ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "votatis-api" });
  });
});
