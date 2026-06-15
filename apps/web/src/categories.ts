// report 분류(category) 고정 enum. 서버 계약(스펙 0007)과 동일 출처.
// 생성·필터·UI 가 같은 목록을 본다. 변경 시 서버 상수와 동기화.
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

// 도메인 세그먼트(스펙 0014). election | assembly. 기본 election.
// 서버 계약(apps/api/src/categories.ts)과 값 동일 출처.
export const REPORT_DOMAINS = ["election", "assembly"] as const;
export type ReportDomain = (typeof REPORT_DOMAINS)[number];

// assembly 도메인 분류 집합(0014 결정 3, 최소 MVP). election 분류와 분리.
export const ASSEMBLY_CATEGORIES = [
  "집회·시위",
  "충돌·물리력",
  "채증·촬영",
  "기타",
] as const;

export type AssemblyCategory = (typeof ASSEMBLY_CATEGORIES)[number];

// 도메인에 따라 허용 분류 집합이 갈린다(서버 categoriesFor 와 일치).
export function categoriesForDomain(
  domain: ReportDomain,
): readonly string[] {
  return domain === "assembly" ? ASSEMBLY_CATEGORIES : REPORT_CATEGORIES;
}
