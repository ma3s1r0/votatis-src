// "내 제보" 접수번호 보관(스펙 0013 결정 5: 서버 세션 없음, 클라이언트 localStorage).
// 서버는 제보자-번호 매핑을 식별 저장하지 않는다. 기기 변경 시 번호 직접 입력으로 조회.

const KEY = "votatis_my_reports";

export function getMyReports(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

// 접수번호를 목록 맨 앞에 누적 저장(중복 제거).
export function addMyReport(trackingNumber: string): void {
  try {
    const existing = getMyReports().filter((n) => n !== trackingNumber);
    const next = [trackingNumber, ...existing];
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage 미사용 환경 — 저장 실패는 조용히 무시(접수 자체는 정상).
  }
}
