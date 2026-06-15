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
