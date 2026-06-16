import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import TabBar from "./TabBar";
import DomainSegment, { type DomainOption } from "./DomainSegment";
import { fetchMapStats, type MapStatItem } from "./map/api";
import { sidoLatLng } from "./map/sido-coords";

// 0018 지도 뷰. 외부 지도(Leaflet + OpenStreetMap)에 시도 대표 좌표로 원형 마커.
// 마커 색 = 시도별 우세 상태(검증됨 초록 / 검증중 주황 / 미검증 빨강). 클릭 → /archive?sido=.

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: MapStatItem[] };

type StatusKey = "verified" | "reviewing" | "unverified";

const STATUS_COLOR: Record<StatusKey, string> = {
  verified: "#1a7f5a",
  reviewing: "#9a6700",
  unverified: "#b3261e",
};

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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

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

  // 위경도가 있는 시도(마커)와 없는/null 시도(미지정 버킷)를 분리.
  const pins = items
    .map((it) => ({ it, ll: sidoLatLng(it.sido), status: dominantStatus(it) }))
    .filter(
      (p): p is { it: MapStatItem; ll: { lat: number; lng: number }; status: StatusKey } =>
        p.ll !== null,
    );
  const unmapped = items.filter((it) => sidoLatLng(it.sido) === null);

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

  // Leaflet 지도 + 마커 (데이터 준비 후). jsdom 등 비브라우저 환경은 try/catch 로 안전 폴백.
  useEffect(() => {
    if (state.status !== "ready") return;
    const el = containerRef.current;
    if (!el) return;
    try {
      let map = mapRef.current;
      if (!map) {
        map = L.map(el, { scrollWheelZoom: false }).setView([36.3, 127.8], 6);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 18,
        }).addTo(map);
        mapRef.current = map;
      }
      layerRef.current?.remove();
      const group = L.layerGroup().addTo(map);
      layerRef.current = group;
      for (const { it, ll, status } of pins) {
        const marker = L.circleMarker([ll.lat, ll.lng], {
          radius: 9,
          color: "#ffffff",
          weight: 2,
          fillColor: STATUS_COLOR[status],
          fillOpacity: 1,
        });
        marker.bindTooltip(`${it.sido} ${it.total}건`, { direction: "top" });
        marker.on("click", () =>
          navigate(`/archive?sido=${encodeURIComponent(it.sido as string)}`),
        );
        marker.addTo(group);
      }
      map.invalidateSize();
    } catch {
      // 지도 초기화 실패(비브라우저/사이즈 0) — 마커 없이 넘어간다(목록 링크로 폴백).
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, navigate]);

  // 언마운트 시 지도 정리. (비브라우저 환경 teardown 오류는 무시)
  useEffect(() => {
    return () => {
      try {
        mapRef.current?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

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
            <div
              ref={containerRef}
              className="map-view"
              role="application"
              aria-label="시도별 제보 분포 지도"
            />

            {/* 접근성/키보드: 지역별 목록 링크(마커와 동일 이동) */}
            <ul className="sr-only">
              {pins.map(({ it }) => (
                <li key={it.sido}>
                  <Link to={`/archive?sido=${encodeURIComponent(it.sido as string)}`}>
                    {it.sido} {it.total}건
                  </Link>
                </li>
              ))}
            </ul>

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
