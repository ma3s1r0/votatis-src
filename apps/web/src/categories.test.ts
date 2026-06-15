import { describe, it, expect } from "vitest";
import {
  REPORT_CATEGORIES,
  ASSEMBLY_CATEGORIES,
  REPORT_DOMAINS,
  categoriesForDomain,
} from "./categories";

// 서버 계약(apps/api/src/categories.ts)과 값이 정확히 일치해야 한다.
describe("도메인별 분류(0014)", () => {
  it("도메인 집합은 election|assembly", () => {
    expect(REPORT_DOMAINS).toEqual(["election", "assembly"]);
  });

  it("election 분류는 0007 7종", () => {
    expect(REPORT_CATEGORIES).toEqual([
      "투개표",
      "사전투표",
      "전산집계",
      "개표참관",
      "명부·선거인",
      "시스템·장비",
      "기타",
    ]);
  });

  it("assembly 분류는 결정3 4종", () => {
    expect(ASSEMBLY_CATEGORIES).toEqual([
      "집회·시위",
      "충돌·물리력",
      "채증·촬영",
      "기타",
    ]);
  });

  it("categoriesForDomain 이 도메인별 분류를 반환한다", () => {
    expect(categoriesForDomain("election")).toEqual(REPORT_CATEGORIES);
    expect(categoriesForDomain("assembly")).toEqual(ASSEMBLY_CATEGORIES);
  });
});
