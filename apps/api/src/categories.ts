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

// 도메인 세그먼트(0014). election | assembly. 기본 election.
export const REPORT_DOMAINS = ["election", "assembly"] as const;
export type ReportDomain = (typeof REPORT_DOMAINS)[number];

export function isReportDomain(value: unknown): value is ReportDomain {
  return typeof value === "string" && (REPORT_DOMAINS as readonly string[]).includes(value);
}

// 0014 결정 3: assembly 분류 집합(최소, MVP). election 분류와 분리된 배열.
export const ASSEMBLY_CATEGORIES = [
  "집회·시위",
  "충돌·물리력",
  "채증·촬영",
  "기타",
] as const;

export type AssemblyCategory = (typeof ASSEMBLY_CATEGORIES)[number];

// 0014 결정 1/3: 도메인에 따라 허용 분류 집합이 갈린다.
function categoriesFor(domain: ReportDomain): readonly string[] {
  return domain === "assembly" ? ASSEMBLY_CATEGORIES : REPORT_CATEGORIES;
}

// 도메인 인지 category 검증(0014). election 집합(0007)·assembly 집합(결정 3) 분기.
// domain 미지정 시 election 으로 본다(생성 기본값과 일관).
export function isReportCategory(value: unknown, domain: ReportDomain = "election"): value is ReportCategory | AssemblyCategory {
  return typeof value === "string" && categoriesFor(domain).includes(value);
}
