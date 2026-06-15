import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchArchiveDetail,
  requestAttachmentDownloadUrl,
  type ArchiveDetail,
} from "./api";

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

  if (state.status === "loading") return <p>불러오는 중…</p>;
  if (state.status === "error")
    return <p role="alert">기록을 불러오지 못했습니다.</p>;
  if (state.status === "not_found") {
    return (
      <main
      style={{
        maxWidth: "var(--container-max)",
        margin: "var(--space-6) auto",
        padding: "0 var(--space-4)",
      }}
    >
        <h1>기록을 찾을 수 없습니다.</h1>
        <p>요청한 기록이 없거나 아직 공개되지 않았습니다.</p>
        <Link to="/archive">아카이브로 돌아가기</Link>
      </main>
    );
  }

  const r = state.report;
  const v = r.verification;

  return (
    <main
      style={{
        maxWidth: "var(--container-max)",
        margin: "var(--space-6) auto",
        padding: "0 var(--space-4)",
      }}
    >
      <p>
        <Link to="/archive">← 아카이브</Link>
      </p>
      <h1>{r.title}</h1>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
        <span>{regionLabel(r)}</span>
        {r.category && <span> · 분류 {r.category}</span>}
        {r.election && <span> · 선거 {r.election.name}</span>}
        {r.occurredAt && <span> · 발생 {r.occurredAt}</span>}
        {r.collectedAt && <span> · 수집 {r.collectedAt}</span>}
      </div>

      {r.body && <p style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>}

      <section>
        <h2>첨부</h2>
        {r.attachments.length === 0 ? (
          <p>첨부 없음</p>
        ) : (
          <ul>
            {/* 다운로드 URL은 상세 응답에 없다 — 클릭 시 별도 엔드포인트에서 단기 URL을 발급받아 이동(0008). */}
            {r.attachments.map((a) => (
              <li key={a.id}>
                <span>{a.filename ?? "(파일명 미상)"}</span>
                {a.size !== null && (
                  <span style={{ color: "var(--color-text-muted)" }}> · {a.size.toLocaleString()} bytes</span>
                )}{" "}
                <button
                  type="button"
                  onClick={() => {
                    requestAttachmentDownloadUrl(r.id, a.id)
                      .then((url) => {
                        window.location.assign(url);
                      })
                      .catch(() => {
                        /* 발급 실패(404 등)는 무음 처리 — 존재 누설 방지. */
                      });
                  }}
                >
                  다운로드
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>출처</h2>
        {r.sources.length === 0 ? (
          <p>출처 없음</p>
        ) : (
          <ul>
            {r.sources.map((s) => (
              <li key={s.id}>
                {s.url ? <a href={s.url}>{s.url}</a> : <span>(URL 미상)</span>}
                {s.capturedAt && (
                  <span style={{ color: "var(--color-text-muted)" }}> (수집 시점: {s.capturedAt})</span>
                )}
                {s.contentHash && (
                  <span style={{ color: "var(--color-text-muted)" }}> (hash: {s.contentHash})</span>
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

      <section
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
        }}
      >
        <h2>검토 요약</h2>
        {v === null ? (
          <p>검토 요약 정보가 없습니다.</p>
        ) : (
          <>
            <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              아래는 검토 과정에서 확인된 범위와 한계입니다. 단정이 아니라
              검증 결과입니다.
            </p>
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
                  <dd>{v.validity}</dd>
                </>
              )}
              {v.severity && (
                <>
                  <dt>심각도</dt>
                  <dd style={{ color: "var(--color-warning)", fontWeight: "var(--weight-medium)" }}>
                    {v.severity}
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
    </main>
  );
}
