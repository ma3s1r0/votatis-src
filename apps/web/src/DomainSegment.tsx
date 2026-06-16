import type { ReportDomain } from "./categories";

// 도메인 세그먼트 컨트롤(0014). 선택=navy 채움, 비선택=연회색.
// value=null 은 "전체"(도메인 필터 미적용) — 아카이브/검수 큐에서만 사용.
export type DomainOption = ReportDomain | null;

type Props = {
  value: DomainOption;
  onChange: (next: DomainOption) => void;
  // "전체" 옵션 노출 여부(목록/검수 큐=true, 제보폼=false).
  includeAll?: boolean;
  // 라벨 커스터마이즈(아카이브="집회 신고" vs 제보폼/검수="집회 현장").
  assemblyLabel?: string;
  // 표시 스타일: "segment"=채움 세그먼트(검수큐), "tabs"=밑줄 탭(게시판 06),
  // "solid"=큰 2버튼 토글(제보폼 02).
  variant?: "segment" | "tabs" | "solid";
};

export default function DomainSegment({
  value,
  onChange,
  includeAll = false,
  assemblyLabel = "집회 현장",
  variant = "segment",
}: Props) {
  const options: { key: string; label: string; domain: DomainOption }[] = [
    ...(includeAll ? [{ key: "all", label: "전체", domain: null }] : []),
    { key: "election", label: "선거 의혹", domain: "election" as DomainOption },
    { key: "assembly", label: assemblyLabel, domain: "assembly" as DomainOption },
  ];
  const base = variant === "tabs" ? "tabs" : variant === "solid" ? "seg-solid" : "segment";

  return (
    <div className={base} role="group" aria-label="도메인 선택">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={
            `${base}__btn` +
            (o.domain === value ? ` ${base}__btn--active` : "")
          }
          aria-pressed={o.domain === value}
          onClick={() => onChange(o.domain)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
