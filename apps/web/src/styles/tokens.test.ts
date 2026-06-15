import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// 디자인 토큰의 단일 출처(tokens.css)가 핵심 키를 정의하는지 구조적으로 검증한다.
// 시각(픽셀) 비교는 비목표 — 토큰이 single source of truth 임을 확인하는 최소 단언.
const css = readFileSync(
  resolve(process.cwd(), "src/styles/tokens.css"),
  "utf8",
);

describe("디자인 토큰 (tokens.css)", () => {
  it(":root 블록에 토큰을 정의한다", () => {
    expect(css).toMatch(/:root\s*\{/);
  });

  it("필수 색 토큰을 정의한다", () => {
    for (const key of [
      "--color-bg",
      "--color-surface",
      "--color-border",
      "--color-text",
      "--color-text-muted",
      "--color-accent",
      "--color-danger",
      "--color-warning",
      "--color-success",
      "--color-focus",
    ]) {
      expect(css).toContain(`${key}:`);
    }
  });

  it("필수 타이포·간격·반경 토큰을 정의한다", () => {
    for (const key of [
      "--font-sans",
      "--text-sm",
      "--text-base",
      "--leading",
      "--space-2",
      "--space-4",
      "--radius-md",
      "--container-max",
    ]) {
      expect(css).toContain(`${key}:`);
    }
  });

  it("accent 는 진영색을 배제한 네이비 값으로 둔다", () => {
    expect(css).toContain("--color-accent: #0a2540");
  });
});
