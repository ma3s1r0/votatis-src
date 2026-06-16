// 표시 계층 포맷 유틸(단일 출처). 저장값은 원문 보존, 화면에서만 가공한다.
// 스펙 0011 P2: 날짜(G), 해시 축약(H), validity/severity 한글 라벨(I).

// 로캘 고정(ko-KR)·UTC 기준으로 테스트·환경 결정성을 확보한다.
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

// ISO 시각 → "2026. 06. 01. 22:10" 류 사람이 읽는 형식. null/빈 값은 빈 문자열.
// 파싱 불가하면 원본을 그대로 반환(예외 던지지 않음).
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFormatter.format(d).replace(/‎/g, "");
}

// ISO → "6.3" 류 짧은 날짜(월.일, UTC). 목록 카드용(Figma 06).
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}

// 조회수 축약: 1,200 → "1.2천", 880 → "880" (Figma 06 "조회 1.2천").
export function formatCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}천`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}천`;
  return String(n);
}

// 콘텐츠 해시 축약: 앞 10자 + 줄임표. 10자 이하·빈 값은 그대로.
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "";
  if (hash.length <= 10) return hash;
  return `${hash.slice(0, 10)}…`;
}

const VALIDITY_LABELS: Record<string, string> = {
  valid: "확인됨",
  partly: "부분 확인",
  invalid: "확인 안 됨",
  unclear: "불명확",
};

// validity 코드(valid/partly/invalid/unclear)를 한글 라벨로. 알 수 없으면 원본.
export function validityLabel(value: string | null | undefined): string {
  if (!value) return "";
  return VALIDITY_LABELS[value] ?? value;
}

const SEVERITY_LABELS: Record<number, string> = {
  1: "매우 낮음",
  2: "낮음",
  3: "보통",
  4: "높음",
  5: "매우 높음",
};

// severity 숫자(1~5)를 한글 라벨로. 범위 밖이면 숫자 문자열, null 이면 빈 문자열.
export function severityLabel(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return SEVERITY_LABELS[n] ?? String(value);
}
