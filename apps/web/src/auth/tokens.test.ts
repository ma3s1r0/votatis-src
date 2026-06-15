import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// 관리 콘솔(LoginPage/QueuePage/ReportDetailPage)이 하드코딩 hex 대신
// 0010 디자인 토큰(var(--color-*))을 사용하는지 구조적으로 검증한다(스펙 0011 K1).
const FILES = [
  "src/auth/LoginPage.tsx",
  "src/auth/QueuePage.tsx",
  "src/auth/ReportDetailPage.tsx",
];

// 0011 K1 에서 제거 대상으로 명시된 하드코딩 색.
const FORBIDDEN_HEX = ["#b00020", "#ddd", "#555", "#777", "#a00", "#0a0"];

describe("관리 콘솔 디자인 토큰화 (K1)", () => {
  for (const rel of FILES) {
    it(`${rel} 에 하드코딩 hex 가 없다`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const hex of FORBIDDEN_HEX) {
        expect(src).not.toContain(hex);
      }
    });
  }

  it("관리 콘솔이 토큰 var() 를 참조한다", () => {
    const src = FILES.map((f) =>
      readFileSync(resolve(process.cwd(), f), "utf8"),
    ).join("\n");
    expect(src).toContain("var(--color-danger)");
  });
});
