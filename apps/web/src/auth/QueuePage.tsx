import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchReports,
  logout,
  type AdminReport,
  type QueueStats,
} from "./api";
import { formatDateTime } from "../format";
import DomainSegment, { type DomainOption } from "../DomainSegment";

const ZERO_STATS: QueueStats = { pending: 0, reviewing: 0, done: 0 };

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: AdminReport[]; stats: QueueStats };

function regionLabel(r: AdminReport): string {
  return [r.sido, r.sigungu, r.eupMyeonDong].filter(Boolean).join(" ") || "지역 미상";
}

function domainLabel(r: AdminReport): string {
  return r.domain === "assembly" ? "집회" : "선거";
}

// 항목 단계 → 상태 dot/라벨. pending=대기(0동의) / reviewing=검증중(1/2) / done=처리(2/2).
function itemStatus(r: AdminReport): { cls: string; label: string } {
  if (r.stage === "done" || r.verified)
    return { cls: "status--verified", label: "처리" };
  if (r.stage === "reviewing")
    return { cls: "status--verifying", label: "검증중" };
  return { cls: "status--unverified", label: "대기" };
}

type StageFilter = "pending" | "reviewing" | "done" | null;

export default function QueuePage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [domain, setDomain] = useState<DomainOption>(null);
  const [stage, setStage] = useState<StageFilter>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchReports(20, 0, domain ?? undefined, stage ?? undefined)
      .then((res) => {
        if (alive)
          setState({
            status: "ready",
            items: res.items,
            stats: res.stats ?? ZERO_STATS,
          });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [domain, stage]);

  // KPI 카드 클릭 → 해당 단계로 필터(같은 카드 다시 누르면 해제 = 활성 큐).
  function onStage(s: Exclude<StageFilter, null>) {
    setStage((prev) => (prev === s ? null : s));
  }

  async function onLogout() {
    await logout();
    navigate("/admin/login");
  }

  // KPI/통계는 서버 단계별 집계(stats) 사용 — 큐 목록은 처리(verified)를 제외하므로 목록 파생 불가.
  const stats = state.status === "ready" ? state.stats : ZERO_STATS;
  const kpiPending = stats.pending;
  const kpiReviewing = stats.reviewing;
  const kpiDone = stats.done;

  return (
    <>
    <main className="container">
      <div className="list-head">
        <h1>검수 큐</h1>
        <button type="button" onClick={onLogout} className="btn btn-secondary btn-sm">
          로그아웃
        </button>
      </div>
      <p className="queue-stat">
        대기 {kpiPending} · 검증중 {kpiReviewing} · 처리 {kpiDone}
      </p>

      <div className="kpi-row">
        <button
          type="button"
          className={"kpi-card" + (stage === "pending" ? " kpi-card--active" : "")}
          aria-pressed={stage === "pending"}
          onClick={() => onStage("pending")}
        >
          <span className="kpi-card__num">{kpiPending}</span>
          <span className="kpi-card__label">대기</span>
        </button>
        <button
          type="button"
          className={"kpi-card" + (stage === "reviewing" ? " kpi-card--active" : "")}
          aria-pressed={stage === "reviewing"}
          onClick={() => onStage("reviewing")}
        >
          <span className="kpi-card__num">{kpiReviewing}</span>
          <span className="kpi-card__label">검증중</span>
        </button>
        <button
          type="button"
          className={"kpi-card" + (stage === "done" ? " kpi-card--active" : "")}
          aria-pressed={stage === "done"}
          onClick={() => onStage("done")}
        >
          <span className="kpi-card__num">{kpiDone}</span>
          <span className="kpi-card__label">처리</span>
        </button>
      </div>

      <DomainSegment value={domain} onChange={setDomain} includeAll />

      {stage && (
        <p className="queue-filter-note">
          {stage === "pending" ? "대기" : stage === "reviewing" ? "검증중" : "처리"}{" "}
          제보만 표시 중 ·{" "}
          <button type="button" className="link-btn" onClick={() => setStage(null)}>
            필터 해제
          </button>
        </p>
      )}

      {state.status === "loading" && <p>불러오는 중…</p>}
      {state.status === "error" && <p role="alert">목록을 불러오지 못했습니다.</p>}
      {state.status === "ready" && state.items.length === 0 && (
        <p>검토할 제보가 없습니다.</p>
      )}
      {state.status === "ready" && state.items.length > 0 && (
        <ul className="list-reset">
          {state.items.map((r) => {
            const s = itemStatus(r);
            return (
              <li key={r.id} className="archive-item">
                {r.thumbnailUrl ? (
                  <img
                    className="archive-item__thumb"
                    src={r.thumbnailUrl}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <div className="archive-item__thumb" aria-hidden="true" />
                )}
                <div className="archive-item__body">
                  <Link to={`/admin/reports/${r.id}`} className="archive-item__title">
                    {r.title}
                  </Link>
                  <span className={`status ${s.cls}`}>
                    <span className="status__dot" /> {s.label}
                  </span>
                  <div className="archive-item__meta">
                    <span>
                      {domainLabel(r)} · {regionLabel(r)}
                    </span>
                    {r.collectedAt && <span> · {formatDateTime(r.collectedAt)}</span>}
                  </div>
                  <p
                    className={
                      "archive-item__exif" +
                      (r.verified ? "" : " archive-item__exif--warn")
                    }
                  >
                    {r.verified ? "EXIF ✓ 원본 확인" : "EXIF ⚠ 확인 필요"}
                  </p>
                </div>
                <Link
                  to={`/admin/reports/${r.id}`}
                  className="btn btn-publish btn-sm archive-item__action"
                >
                  검수
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
    </>
  );
}
