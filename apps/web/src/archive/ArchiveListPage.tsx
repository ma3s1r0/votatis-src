import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchArchive,
  type ArchiveItem,
  type ArchiveListQuery,
} from "./api";
import { categoriesForDomain } from "../categories";
import { fetchElections, type Election } from "../elections";
import { shortDate, formatCount } from "../format";
import TabBar from "../TabBar";
import DomainSegment, { type DomainOption } from "../DomainSegment";

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

// 시도 접미사 축약(Figma 06: "서울 강서구", "경기 부천").
function shortSido(s: string | null): string {
  if (!s) return "";
  return s.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
}
function regionLabel(r: ArchiveItem): string {
  return [shortSido(r.sido), r.sigungu].filter(Boolean).join(" ") || "지역 미상";
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
    // Figma 06: "전체" 탭 없음 — 기본 도메인은 선거 의혹(election).
    domain: params.get("domain") || "election",
  };
}

function domainOf(params: URLSearchParams): DomainOption {
  const d = params.get("domain");
  return d === "assembly" ? "assembly" : "election";
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

  const selectedDomain = domainOf(searchParams);
  // 도메인 전환 시 분류는 도메인별 집합이므로 함께 초기화한다.
  function onDomain(next: DomainOption) {
    patchParams({ domain: next ?? undefined, category: undefined });
  }
  const categoryOptions = categoriesForDomain(selectedDomain ?? "election");

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
    <main className="container">
      <h1>검증 아카이브</h1>

      <DomainSegment
        value={selectedDomain}
        onChange={onDomain}
        assemblyLabel="집회 신고"
        variant="tabs"
      />

      <details className="filter-panel">
        <summary className="filter-panel__summary">검색 · 필터</summary>
        <form onSubmit={onSearch} className="filter-bar">
        <label className="field" htmlFor="archive-search">
          검색
          <input
            id="archive-search"
            className="input"
            type="search"
            aria-label="검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="제목·내용 검색"
          />
        </label>
        <button type="submit" className="btn btn-secondary">
          검색
        </button>

        <label className="field" htmlFor="archive-sido">
          지역
        <select
          id="archive-sido"
          className="input"
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
        </label>

        <label className="field" htmlFor="archive-category">
          분류
        <select
          id="archive-category"
          className="input"
          aria-label="분류"
          value={query.category ?? ""}
          onChange={(e) => onCategory(e.target.value)}
        >
          <option value="">전체 분류</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        </label>

        <label className="field" htmlFor="archive-election">
          선거
        <select
          id="archive-election"
          className="input"
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
        </label>
        </form>
      </details>

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
          <ul className="list-reset">
            {state.items.map((r) => (
              <li key={r.id} className="archive-item archive-item--post">
                <div className="archive-item__thumb" aria-hidden="true" />
                <div className="archive-item__body">
                  <Link to={`/archive/${r.id}`} className="archive-item__title">
                    {r.title}
                  </Link>
                  <p className="archive-item__verified">✓ 검증됨</p>
                  <div className="archive-item__meta">
                    <span>{regionLabel(r)}</span>
                    {r.collectedAt && <span> · {shortDate(r.collectedAt)}</span>}
                    {typeof r.viewCount === "number" && (
                      <span> · 조회 {formatCount(r.viewCount)}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <nav className="pagination" aria-label="페이지 이동">
            <button
              type="button"
              onClick={goPrev}
              disabled={!hasPrev}
              className="btn btn-secondary"
            >
              이전
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!hasNext}
              className="btn btn-secondary"
            >
              다음
            </button>
          </nav>
        </>
      )}
    </main>
    <TabBar />
    </>
  );
}
