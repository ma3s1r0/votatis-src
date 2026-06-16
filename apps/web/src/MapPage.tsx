import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import TabBar from "./TabBar";
import DomainSegment, { type DomainOption } from "./DomainSegment";
import { fetchMapStats, type MapStatItem } from "./map/api";
import { sidoCoord } from "./map/sido-coords";

// 0018 지도 뷰. 실 타일/지오코딩 비목표 — 시도 정적 좌표 + SVG 핀.
// 핀 색 = 시도별 우세 상태(검증됨 초록 / 검증중 주황 / 미검증 빨강).
// 핀 클릭 → /archive?sido= 로 0005 목록 필터.

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: MapStatItem[] };

type StatusKey = "verified" | "reviewing" | "unverified";

const STATUS_CLASS: Record<StatusKey, string> = {
  verified: "verified",
  reviewing: "verifying",
  unverified: "unverified",
};

// 시도별 우세 상태(검증됨 우선 동률 처리: verified > reviewing > unverified).
function dominantStatus(item: MapStatItem): StatusKey {
  const { verified, reviewing, unverified } = item.byStatus;
  if (verified >= reviewing && verified >= unverified) return "verified";
  if (reviewing >= unverified) return "reviewing";
  return "unverified";
}

function domainOf(params: URLSearchParams): DomainOption {
  const d = params.get("domain");
  return d === "election" || d === "assembly" ? d : null;
}

export default function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  const domain = domainOf(searchParams);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchMapStats(domain)
      .then((items) => {
        if (alive) setState({ status: "ready", items });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [domain]);

  function onDomain(next: DomainOption) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set("domain", next);
        else p.delete("domain");
        return p;
      },
      { replace: true },
    );
  }

  const items = state.status === "ready" ? state.items : [];

  // 좌표가 있는 시도(핀)와 없는/null 시도(미지정 버킷)를 분리한다.
  const pins = items
    .map((it) => ({ it, coord: sidoCoord(it.sido) }))
    .filter((p): p is { it: MapStatItem; coord: { x: number; y: number } } =>
      p.coord !== null,
    );
  const unmapped = items.filter((it) => sidoCoord(it.sido) === null);

  const totals = items.reduce(
    (acc, it) => {
      acc.total += it.total;
      acc.verified += it.byStatus.verified;
      acc.reviewing += it.byStatus.reviewing;
      acc.unverified += it.byStatus.unverified;
      return acc;
    },
    { total: 0, verified: 0, reviewing: 0, unverified: 0 },
  );

  const unmappedTotal = unmapped.reduce((n, it) => n + it.total, 0);

  return (
    <>
      <main className="container">
        <h1>지도 뷰</h1>
        <p className="map-sub">
          전국 제보 분포 · 총 {totals.total.toLocaleString()}건
        </p>

        <DomainSegment
          value={domain}
          onChange={onDomain}
          includeAll
          assemblyLabel="집회 신고"
        />

        {state.status === "loading" && <p>불러오는 중…</p>}
        {state.status === "error" && (
          <p role="alert">지도 집계를 불러오지 못했습니다.</p>
        )}

        {state.status === "ready" && (
          <>
            <div className="map-view">
              <svg
                className="map-view__svg"
                viewBox="0 0 100 100"
                role="img"
                aria-label="시도별 제보 분포"
                preserveAspectRatio="xMidYMid meet"
              >
                {pins.map(({ it, coord }) => {
                  const s = dominantStatus(it);
                  // 건수에 따라 핀 크기 가변(분포 강조). 3~7 반경.
                  const r = Math.min(7, 3 + Math.log2(it.total + 1));
                  return (
                    <Link
                      key={it.sido}
                      to={`/archive?sido=${encodeURIComponent(it.sido as string)}`}
                      aria-label={`${it.sido} ${it.total}건`}
                      className={`map-pin map-pin--${STATUS_CLASS[s]}`}
                    >
                      <circle cx={coord.x} cy={coord.y} r={r} />
                      <text
                        x={coord.x}
                        y={coord.y + 1.4}
                        textAnchor="middle"
                        className="map-pin__count"
                      >
                        {it.total}
                      </text>
                    </Link>
                  );
                })}
              </svg>
            </div>

            <p className="map-hint">핀을 탭하면 해당 지역 제보 목록으로 이동</p>

            <div className="map-legend" role="group" aria-label="범례">
              <p className="map-legend__title">범례</p>
              <div className="map-legend__row">
                <span className="map-legend__dot map-legend__dot--verified" />
                ✓ 검증됨 · {totals.verified}건
              </div>
              <div className="map-legend__row">
                <span className="map-legend__dot map-legend__dot--verifying" />●
                검증중 · {totals.reviewing}건
              </div>
              <div className="map-legend__row">
                <span className="map-legend__dot map-legend__dot--unverified" />●
                미검증 · {totals.unverified}건
              </div>
            </div>

            {unmappedTotal > 0 && (
              <p className="map-unmapped">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate("/archive")}
                >
                  미지정 지역 {unmappedTotal}건
                </button>
              </p>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}
