import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchArchiveDetail,
  requestAttachmentDownloadUrl,
  type ArchiveDetail,
} from "./api";
import {
  formatDateTime,
  shortHash,
  validityLabel,
  severityLabel,
} from "../format";
import TabBar from "../TabBar";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not_found" }
  | { status: "ready"; report: ArchiveDetail };

function regionLabel(r: ArchiveDetail): string {
  return [r.sido, r.sigungu, r.eupMyeonDong].filter(Boolean).join(" ") || "지역 미상";
}

export default function ArchiveDetailPage() {
  const { id = "" } = useParams();
  const [state, setState] = useState<State>({ status: "loading" });
  // 첨부 다운로드 발급 실패 시 사용자 피드백(존재 여부 누설 없는 일반 문구).
  const [downloadError, setDownloadError] = useState(false);
  // 이미지 첨부는 인라인 표시 — 마운트 후 단기 presigned URL 을 받아 보관(id→url).
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetchArchiveDetail(id)
      .then((res) => {
        if (!alive) return;
        if (res.ok) setState({ status: "ready", report: res.report });
        else if (res.error === "not_found") setState({ status: "not_found" });
        else setState({ status: "error" });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // ready 가 되면 이미지 첨부에 대해 presigned URL 을 받아 인라인 표시한다.
  useEffect(() => {
    if (state.status !== "ready") return;
    let alive = true;
    const images = state.report.attachments.filter((a) =>
      a.mime?.startsWith("image/"),
    );
    for (const a of images) {
      requestAttachmentDownloadUrl(state.report.id, a.id)
        .then((url) => {
          if (alive) setImageUrls((prev) => ({ ...prev, [a.id]: url }));
        })
        .catch(() => {
          /* 개별 이미지 실패는 무시(다운로드 버튼 폴백 유지) */
        });
    }
    return () => {
      alive = false;
    };
  }, [state]);

  if (state.status === "loading")
    return (
      <main className="container">
        <p>불러오는 중…</p>
      </main>
    );
  if (state.status === "error")
    return (
      <main className="container">
        <p role="alert">기록을 불러오지 못했습니다.</p>
      </main>
    );
  if (state.status === "not_found") {
    return (
      <>
      <main className="container">
        <h1>기록을 찾을 수 없습니다.</h1>
        <p>요청한 기록이 없거나 아직 공개되지 않았습니다.</p>
        <Link to="/archive">아카이브로 돌아가기</Link>
      </main>
      <TabBar />
      </>
    );
  }

  const r = state.report;
  const v = r.verification;

  return (
    <>
    <main className="container">
      <div className="page-head">
        <Link to="/archive" className="page-back" aria-label="아카이브로 돌아가기">
          ←
        </Link>
        <h1 className="page-head__title">{r.title}</h1>
      </div>
      <div className="detail-image" aria-hidden="true" />

      {v?.verified && (
        <div className="detail-badges">
          <span className="detail-badge detail-badge--ok">✓ 검증됨</span>
          <span className="detail-badge detail-badge--ok">EXIF 정상</span>
          <span className="detail-badge detail-badge--ok">위변조 없음</span>
        </div>
      )}

      <div className="meta-row">
        <span>{regionLabel(r)}</span>
        {r.category && <span> · 분류 {r.category}</span>}
        {r.election && <span> · 선거 {r.election.name}</span>}
        {r.occurredAt && <span> · 발생 {formatDateTime(r.occurredAt)}</span>}
        {r.collectedAt && <span> · 수집 {formatDateTime(r.collectedAt)}</span>}
        <span> · 조회 {r.viewCount.toLocaleString()}</span>
      </div>

      {v?.verified && (
        <section className="history-flow">
          <h2 className="history-flow__title">검증 이력</h2>
          <p className="history-flow__steps">제출 → 포렌식 통과 → 공개</p>
        </section>
      )}

      {r.body && <p className="detail-body">{r.body}</p>}

      <details className="more-data">
        <summary className="more-data__summary">
          근거 데이터 · 첨부 / 출처 / 검토 요약
        </summary>

      <section className="section-card">
        <h2>첨부</h2>
        {r.attachments.length === 0 ? (
          <p>첨부 없음</p>
        ) : (
          <ul className="attachment-list">
            {/* 다운로드 URL은 상세 응답에 없다 — 별도 엔드포인트에서 단기 URL을 발급(0008).
                이미지는 마운트 시 받아 인라인 표시, 그 외(PDF 등)는 다운로드 버튼. */}
            {r.attachments.map((a) => (
              <li key={a.id}>
                {a.mime?.startsWith("image/") && imageUrls[a.id] && (
                  <figure className="attachment-figure">
                    <img
                      className="attachment-image"
                      src={imageUrls[a.id]}
                      alt={a.filename ?? "첨부 이미지"}
                    />
                  </figure>
                )}
                <span>{a.filename ?? "(파일명 미상)"}</span>
                {a.size !== null && (
                  <span style={{ color: "var(--color-text-muted)" }}> · {a.size.toLocaleString()} bytes</span>
                )}{" "}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDownloadError(false);
                    requestAttachmentDownloadUrl(r.id, a.id)
                      .then((url) => {
                        window.location.assign(url);
                      })
                      .catch(() => {
                        // 발급 실패(404 등): 존재 여부를 누설하지 않는 일반 메시지.
                        setDownloadError(true);
                      });
                  }}
                >
                  다운로드
                </button>
              </li>
            ))}
          </ul>
        )}
        {downloadError && (
          <p role="alert" className="text-danger">
            다운로드를 준비할 수 없습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </section>

      <section className="section-card">
        <h2>출처</h2>
        {r.sources.length === 0 ? (
          <p>출처 없음</p>
        ) : (
          <ul>
            {r.sources.map((s) => (
              <li key={s.id}>
                {s.url ? <a href={s.url}>{s.url}</a> : <span>(URL 미상)</span>}
                {s.capturedAt && (
                  <span style={{ color: "var(--color-text-muted)" }}> (수집 시점: {formatDateTime(s.capturedAt)})</span>
                )}
                {s.contentHash && (
                  <span
                    title={s.contentHash}
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {" "}
                    (hash: {shortHash(s.contentHash)})
                  </span>
                )}
                {s.archiveUrl && (
                  <>
                    {" "}
                    <a href={s.archiveUrl}>[아카이브 스냅샷]</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="review-card">
        <h2>검토 요약</h2>
        {v === null ? (
          <p>검토 요약 정보가 없습니다.</p>
        ) : (
          <>
            <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              아래는 검토 과정에서 확인된 범위와 한계입니다. 단정이 아니라
              검증 결과입니다.
            </p>
            {v.verified && (
              <p>
                <span className="badge badge-verified">검증됨</span>
              </p>
            )}
            <dl>
              {v.method && (
                <>
                  <dt>확인 방법</dt>
                  <dd>{v.method}</dd>
                </>
              )}
              {v.validity && (
                <>
                  <dt>확인 범위(유효성)</dt>
                  <dd>
                    <span className="badge badge-neutral">
                      {validityLabel(v.validity)}
                    </span>
                  </dd>
                </>
              )}
              {v.severity && (
                <>
                  <dt>심각도</dt>
                  <dd>
                    <span className="badge badge-sev-4">
                      {severityLabel(v.severity)}
                    </span>
                  </dd>
                </>
              )}
              {v.notes && (
                <>
                  <dt>검토 메모</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{v.notes}</dd>
                </>
              )}
            </dl>

            <h3>확인되지 않은 주장</h3>
            {v.unverifiedClaims ? (
              <p style={{ whiteSpace: "pre-wrap" }}>{v.unverifiedClaims}</p>
            ) : (
              <p>해당 없음</p>
            )}
          </>
        )}
      </section>
      </details>
    </main>
    <TabBar />
    </>
  );
}
