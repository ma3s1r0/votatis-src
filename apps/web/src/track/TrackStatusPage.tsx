import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TabBar from "../TabBar";
import { fetchTrackingStatus, type TrackingStatus } from "./api";

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

export default function TrackStatusPage() {
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("number") ?? "");
  const [state, setState] = useState<State>({ status: "idle" });

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

  // URL ?number= 로 진입하면 자동 조회(완료 화면·내 제보에서 딥링크).
  useEffect(() => {
    const fromUrl = params.get("number");
    if (fromUrl) void lookup(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <p className="page-intro">
          접수번호로 제보의 진행 상태를 확인할 수 있습니다. 본문·첨부 등 내용은
          공개되지 않으며 단계만 표시됩니다.
        </p>

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
      </main>
      <TabBar />
    </>
  );
}
