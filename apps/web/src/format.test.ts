import { describe, it, expect } from "vitest";
import {
  formatDateTime,
  shortHash,
  validityLabel,
  severityLabel,
} from "./format";

describe("formatDateTime", () => {
  it("ISO 문자열을 사람이 읽는 한국어 형식으로 변환한다(ISO 원문 미노출)", () => {
    const out = formatDateTime("2026-06-01T22:10:00Z");
    // ISO 원문(T...Z)이 포함되지 않아야 한다.
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(out).not.toMatch(/Z$/);
    // 사람이 읽는 날짜·시각 요소를 담는다.
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/22[:시]/);
  });

  it("null/빈 값은 예외 없이 빈 문자열을 반환한다", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime(undefined)).toBe("");
  });

  it("파싱 불가한 값은 예외를 던지지 않고 원본 비-ISO 문자열을 그대로 둔다", () => {
    expect(() => formatDateTime("not-a-date")).not.toThrow();
  });
});

describe("shortHash", () => {
  it("앞 10자 + 줄임표로 축약한다", () => {
    const full =
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    expect(shortHash(full)).toBe("abcdef0123…");
  });

  it("10자 이하 해시는 그대로 둔다", () => {
    expect(shortHash("abc123")).toBe("abc123");
  });

  it("null/빈 값은 빈 문자열", () => {
    expect(shortHash(null)).toBe("");
    expect(shortHash("")).toBe("");
  });
});

describe("validityLabel", () => {
  it("validity 코드를 한글 라벨로 매핑한다", () => {
    expect(validityLabel("valid")).toBe("확인됨");
    expect(validityLabel("partly")).toBe("부분 확인");
    expect(validityLabel("invalid")).toBe("확인 안 됨");
    expect(validityLabel("unclear")).toBe("불명확");
  });

  it("이미 한글이거나 알 수 없는 값은 원본을 반환한다", () => {
    expect(validityLabel("부분 확인")).toBe("부분 확인");
    expect(validityLabel(null)).toBe("");
  });
});

describe("severityLabel", () => {
  it("severity 숫자를 한글 라벨로 매핑한다", () => {
    expect(severityLabel(1)).toBe("매우 낮음");
    expect(severityLabel(3)).toBe("보통");
    expect(severityLabel(5)).toBe("매우 높음");
  });

  it("문자열 숫자도 매핑한다", () => {
    expect(severityLabel("3")).toBe("보통");
  });

  it("범위를 벗어나거나 null 이면 안전하게 처리한다", () => {
    expect(severityLabel(null)).toBe("");
    expect(severityLabel(9)).toBe("9");
  });
});
