// "내 제보" 보관(스펙 0013 결정 5: 서버 세션 없음, 클라이언트 localStorage).
// 서버는 제보자-번호 매핑을 식별 저장하지 않는다. 제출 시점에 사용자가 입력한
// 제목·도메인·날짜를 "이 기기에만" 함께 저장해 내 제보 목록 카드에 표시한다(익명 유지).

const KEY = "votatis_my_reports";

export type MyReport = {
  number: string;
  title?: string;
  domain?: string;
  createdAt?: string;
};

export function getMyReports(): MyReport[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 구버전(문자열 배열) 호환: 문자열은 number 만 가진 레코드로 승격.
    return parsed
      .map((x) => (typeof x === "string" ? { number: x } : x))
      .filter(
        (x): x is MyReport =>
          x != null && typeof x === "object" && typeof x.number === "string",
      );
  } catch {
    return [];
  }
}

// 접수번호(+선택 메타)를 목록 맨 앞에 누적 저장(중복 제거). 문자열도 허용(하위호환).
export function addMyReport(report: string | MyReport): void {
  try {
    const rec: MyReport =
      typeof report === "string" ? { number: report } : report;
    const existing = getMyReports().filter((r) => r.number !== rec.number);
    localStorage.setItem(KEY, JSON.stringify([rec, ...existing]));
  } catch {
    // localStorage 미사용 환경 — 저장 실패는 조용히 무시(접수 자체는 정상).
  }
}
