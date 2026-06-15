import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchArchive,
  type ArchiveItem,
  type ArchiveListQuery,
} from "./api";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: ArchiveItem[]; total: number };

const PAGE_SIZE = 20;

// 필터 옵션은 공개 표시용 최소 집합. 값은 서버 파라미터로 그대로 전달된다.
const SIDO_OPTIONS = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

function regionLabel(r: ArchiveItem): string {
  return [r.sido, r.sigungu].filter(Boolean).join(" ") || "지역 미상";
}

export default function ArchiveListPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState<ArchiveListQuery>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  // 검색 입력은 제출 전까지 query에 반영하지 않는다(요청 폭주 방지).
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchArchive(query)
      .then((res) => {
        if (alive) setState({ status: "ready", items: res.items, total: res.total });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [query]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    setQuery((prev) => ({ ...prev, q: q || undefined, offset: 0 }));
  }

  function onSido(value: string) {
    setQuery((prev) => ({ ...prev, sido: value || undefined, offset: 0 }));
  }

  const offset = query.offset ?? 0;
  const total = state.status === "ready" ? state.total : 0;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  function goPrev() {
    setQuery((prev) => ({ ...prev, offset: Math.max(0, offset - PAGE_SIZE) }));
  }
  function goNext() {
    setQuery((prev) => ({ ...prev, offset: offset + PAGE_SIZE }));
  }

  return (
    <main style={{ maxWidth: 880, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>공개 아카이브</h1>
      <p style={{ color: "#555" }}>
        검증을 거친 기록만 공개합니다. 각 기록은 출처와 검토 범위를 함께
        제공합니다.
      </p>

      <form
        onSubmit={onSearch}
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "1rem 0" }}
      >
        <label htmlFor="archive-search">검색</label>
        <input
          id="archive-search"
          type="search"
          aria-label="검색"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="제목·내용 검색"
        />
        <button type="submit">검색</button>

        <label htmlFor="archive-sido">지역</label>
        <select
          id="archive-sido"
          aria-label="지역"
          value={query.sido ?? ""}
          onChange={(e) => onSido(e.target.value)}
        >
          <option value="">전체 지역</option>
          {SIDO_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </form>

      {state.status === "loading" && <p>불러오는 중…</p>}
      {state.status === "error" && (
        <p role="alert">목록을 불러오지 못했습니다.</p>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <p>조건에 맞는 기록이 없습니다.</p>
      )}
      {state.status === "ready" && state.items.length > 0 && (
        <>
          <p style={{ color: "#555", fontSize: "0.85rem" }}>총 {total}건</p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {state.items.map((r) => (
              <li
                key={r.id}
                style={{ borderBottom: "1px solid #ddd", padding: "0.75rem 0" }}
              >
                <Link to={`/archive/${r.id}`}>{r.title}</Link>
                <div style={{ fontSize: "0.85rem", color: "#555" }}>
                  <span>{regionLabel(r)}</span>
                  {r.collectedAt && <span> · 수집 {r.collectedAt}</span>}
                </div>
              </li>
            ))}
          </ul>

          <nav
            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            aria-label="페이지 이동"
          >
            <button type="button" onClick={goPrev} disabled={!hasPrev}>
              이전
            </button>
            <button type="button" onClick={goNext} disabled={!hasNext}>
              다음
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
