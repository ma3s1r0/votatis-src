import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TabBar from "../TabBar";
import { fetchTrackingStatus, type TrackingStatus, type TrackingStage } from "./api";
import { getMyReports, type MyReport } from "./storage";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: TrackingStatus }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error" };

// publicUrl(서버: /reports/:id)에서 id 만 취해 공개 아카이브 상세 경로로 변환.
function archiveHref(publicUrl: string): string {
  const id = publicUrl.split("/").filter(Boolean).pop() ?? "";
  return `/archive/${id}`;
}

const STAGE_LABEL: Record<TrackingStage, string> = {
  received: "접수됨",
  reviewing: "검수 중",
  verified: "검증 완료",
  published: "공개",
};
// 단계 → 상태 dot(공용 .status). 진행 전반=검수중(주황), 완료/공개=검증됨(초록).
function stageStatusClass(stage: TrackingStage): string {
  return stage === "verified" || stage === "published"
    ? "status--verified"
    : "status--verifying";
}

function domainLabel(domain?: string): string {
  if (domain === "assembly") return "집회 현장";
  if (domain === "election") return "선거 의혹";
  return "";
}

// 내 제보 카드: 제출 시 저장된 메타(제목/도메인/날짜) + 조회한 현재 단계.
type MyItem = MyReport & { stage: TrackingStage | null };

export default function TrackStatusPage() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("number") ?? "");
  const [state, setState] = useState<State>({ status: "idle" });
  const [myList, setMyList] = useState<MyItem[]>([]);

  async function lookup(number: string) {
    const trimmed = number.trim();
    if (!trimmed) return;
    setState({ status: "loading" });
    const res = await fetchTrackingStatus(trimmed);
    if (res.ok) {
      setState({ status: "ready", data: res.status });
    } else if (res.error === "not_found") {
      setState({ status: "not_found" });
    } else if (res.error === "rate_limited") {
      setState({ status: "rate_limited" });
    } else {
      setState({ status: "error" });
    }
  }

  useEffect(() => {
    const fromUrl = params.get("number");
    if (fromUrl) void lookup(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 내 제보 목록(localStorage 접수번호) — 각 번호의 현재 단계를 병렬 조회.
  useEffect(() => {
    let alive = true;
    const reports = getMyReports();
    if (reports.length === 0) return;
    Promise.all(
      reports.map(async (r) => {
        const res = await fetchTrackingStatus(r.number);
        return {
          ...r,
          stage: res.ok ? res.status.currentStage : null,
        } as MyItem;
      }),
    ).then((items) => {
      if (alive) setMyList(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParams(input.trim() ? { number: input.trim() } : {});
    void lookup(input);
  }

  return (
    <>
      <main className="container">
        <div className="page-head">
          <Link to="/" className="page-back" aria-label="홈으로">
            ←
          </Link>
          <h1 className="page-head__title">제보 상태 조회</h1>
        </div>

        <form onSubmit={onSubmit} className="track-form">
          <label className="track-form__label">
            접수번호
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="VT-2026-0615-0042"
              className="track-form__input"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            조회
          </button>
        </form>

        {state.status === "loading" && <p className="page-intro">조회 중…</p>}

        {state.status === "not_found" && (
          <p role="alert" className="track-notice text-danger">
            해당 접수번호의 제보를 찾을 수 없습니다.
          </p>
        )}
        {state.status === "rate_limited" && (
          <p role="alert" className="track-notice text-danger">
            요청이 많습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="track-notice text-danger">
            상태 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}

        {state.status === "ready" && (
          <section className="track-result">
            <p className="track-result__number">{state.data.trackingNumber}</p>
            <ol className="timeline">
              {state.data.timeline.map((step) => (
                <li
                  key={step.stage}
                  className={`timeline__step timeline__step--${step.state}`}
                  aria-current={step.state === "current" ? "step" : undefined}
                >
                  <span className="timeline__dot" aria-hidden="true" />
                  <span className="timeline__label">{step.label}</span>
                </li>
              ))}
            </ol>
            {state.data.publicUrl && (
              <Link
                to={archiveHref(state.data.publicUrl)}
                className="btn btn-primary"
              >
                공개 보기
              </Link>
            )}
          </section>
        )}

        {myList.length > 0 && (
          <section aria-label="내 제보 목록">
            <h2>내 제보 목록</h2>
            <ul className="my-reports">
              {myList.map((m) => (
                <li key={m.number}>
                  <Link
                    to={`/track?number=${encodeURIComponent(m.number)}`}
                    className="my-reports__link"
                    onClick={() => {
                      setInput(m.number);
                      void lookup(m.number);
                    }}
                  >
                    <span className="my-reports__body">
                      <span className="my-reports__title">
                        {m.title ?? m.number}
                      </span>
                      {m.stage && (
                        <span className={`status ${stageStatusClass(m.stage)}`}>
                          <span className="status__dot" /> {STAGE_LABEL[m.stage]}
                        </span>
                      )}
                      <span className="my-reports__sub">
                        {[domainLabel(m.domain), m.createdAt?.slice(0, 10)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="my-reports__action">상태 조회 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <TabBar />
    </>
  );
}
