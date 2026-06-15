import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchArchive,
  type ArchiveItem,
  type ArchiveListQuery,
} from "./api";
import { REPORT_CATEGORIES } from "../categories";
import { fetchElections, type Election } from "../elections";
import { formatDateTime } from "../format";
import Header from "../Header";

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

// 쿼리스트링(useSearchParams)을 검색·필터·페이지의 단일 소스로 사용한다.
// 상세로 갔다 뒤로가기 해도 URL에 상태가 보존된다.
function queryFromParams(params: URLSearchParams): ArchiveListQuery {
  const offset = Number(params.get("offset"));
  return {
    limit: PAGE_SIZE,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    q: params.get("q") || undefined,
    sido: params.get("sido") || undefined,
    category: params.get("category") || undefined,
    electionId: params.get("electionId") || undefined,
  };
}

export default function ArchiveListPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [searchParams, setSearchParams] = useSearchParams();
  const query = queryFromParams(searchParams);
  // 검색 입력은 로컬 상태, 디바운스 후 쿼리스트링(q)에 반영한다.
  const [searchInput, setSearchInput] = useState(query.q ?? "");
  const [elections, setElections] = useState<Election[]>([]);

  // 쿼리스트링 일부만 갱신하는 헬퍼(offset은 검색·필터 변경 시 0으로 초기화).
  const setSearchParamsRef = useRef(setSearchParams);
  setSearchParamsRef.current = setSearchParams;
  function patchParams(patch: Record<string, string | undefined>, resetOffset = true) {
    setSearchParamsRef.current(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (resetOffset) next.delete("offset");
        return next;
      },
      { replace: true },
    );
  }

  const queryKey = searchParams.toString();
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchArchive(queryFromParams(new URLSearchParams(queryKey)))
      .then((res) => {
        if (alive) setState({ status: "ready", items: res.items, total: res.total });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [queryKey]);

  // 선거 필터 옵션 로드(선택 사항 — 실패 시 빈 목록).
  useEffect(() => {
    let alive = true;
    fetchElections().then((items) => {
      if (alive) setElections(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 검색 입력 디바운스(300ms): 입력이 현재 쿼리스트링 q와 다를 때만 반영.
  useEffect(() => {
    const trimmed = searchInput.trim();
    const current = query.q ?? "";
    if (trimmed === current) return;
    const t = setTimeout(() => {
      patchParams({ q: trimmed || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // 검색 버튼(보조): 디바운스 대기 없이 즉시 반영.
  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    patchParams({ q: searchInput.trim() || undefined });
  }

  function onSido(value: string) {
    patchParams({ sido: value || undefined });
  }

  function onCategory(value: string) {
    patchParams({ category: value || undefined });
  }

  function onElection(value: string) {
    patchParams({ electionId: value || undefined });
  }

  const offset = query.offset ?? 0;
  const total = state.status === "ready" ? state.total : 0;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  function goPrev() {
    const next = Math.max(0, offset - PAGE_SIZE);
    patchParams({ offset: next > 0 ? String(next) : undefined }, false);
  }
  function goNext() {
    patchParams({ offset: String(offset + PAGE_SIZE) }, false);
  }

  return (
    <>
    <Header />
    <main
      style={{
        maxWidth: "var(--container-max)",
        margin: "var(--space-6) auto",
        padding: "0 var(--space-4)",
      }}
    >
      <h1>공개 아카이브</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        검증을 거친 기록만 공개합니다. 각 기록은 출처와 검토 범위를 함께
        제공합니다.
      </p>

      <form
        onSubmit={onSearch}
        style={{
          display: "flex",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          alignItems: "center",
          margin: "var(--space-4) 0",
          padding: "var(--space-4)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
        }}
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

        <label htmlFor="archive-category">분류</label>
        <select
          id="archive-category"
          aria-label="분류"
          value={query.category ?? ""}
          onChange={(e) => onCategory(e.target.value)}
        >
          <option value="">전체 분류</option>
          {REPORT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label htmlFor="archive-election">선거</label>
        <select
          id="archive-election"
          aria-label="선거"
          value={query.electionId ?? ""}
          onChange={(e) => onElection(e.target.value)}
        >
          <option value="">전체 선거</option>
          {elections.map((el) => (
            <option key={el.id} value={el.id}>
              {el.name}
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
          <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
            총 {total}건
          </p>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {state.items.map((r) => (
              <li
                key={r.id}
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  padding: "var(--space-3) 0",
                }}
              >
                <Link to={`/archive/${r.id}`}>{r.title}</Link>
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span>{regionLabel(r)}</span>
                  {r.collectedAt && <span> · 수집 {formatDateTime(r.collectedAt)}</span>}
                </div>
              </li>
            ))}
          </ul>

          <nav
            style={{
              display: "flex",
              gap: "var(--space-2)",
              alignItems: "center",
              marginTop: "var(--space-4)",
            }}
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
    </>
  );
}
