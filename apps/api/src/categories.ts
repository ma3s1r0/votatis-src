// report.category 고정 enum 집합(0007 결정 1, MVP — 변경 가능).
// 생성·필터·웹 드롭다운이 동일 출처를 본다.
export const REPORT_CATEGORIES = [
  "투개표",
  "사전투표",
  "전산집계",
  "개표참관",
  "명부·선거인",
  "시스템·장비",
  "기타",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export function isReportCategory(value: unknown): value is ReportCategory {
  return typeof value === "string" && (REPORT_CATEGORIES as readonly string[]).includes(value);
}
