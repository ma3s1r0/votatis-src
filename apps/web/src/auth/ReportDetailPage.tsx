import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchReport,
  fetchMe,
  submitVerification,
  type AdminReportDetail,
  type EvidenceLink,
  type FieldError,
} from "./api";
import { formatDateTime, shortHash, validityLabel } from "../format";
import Header from "../Header";

function regionLabel(r: AdminReportDetail): string {
  return (
    [r.sido, r.sigungu, r.eupMyeonDong].filter(Boolean).join(" ") || "지역 미상"
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; report: AdminReportDetail };

type EvidenceDraft = {
  url: string;
  capturedAt: string;
  contentHash: string;
  archiveUrl: string;
};

function emptyEvidence(): EvidenceDraft {
  return { url: "", capturedAt: "", contentHash: "", archiveUrl: "" };
}

export default function ReportDetailPage() {
  const { id = "" } = useParams();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  // 판정 폼 상태
  const [method, setMethod] = useState("");
  const [verified, setVerified] = useState(false);
  const [confidence, setConfidence] = useState("");
  const [validity, setValidity] = useState("");
  const [severity, setSeverity] = useState("");
  const [notes, setNotes] = useState("");
  const [unverifiedClaims, setUnverifiedClaims] = useState("");
  // 근거 링크 블록은 기본 1개 펼쳐둔다(최소 1개 필요).
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([emptyEvidence()]);

  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // 0017 교차검증 진행도(상세 응답 → 동의 제출 응답으로 갱신).
  const [approvals, setApprovals] = useState(0);
  const [required, setRequired] = useState(2);
  const [myId, setMyId] = useState<string | null>(null);
  // 본인이 이미 동의했는지: 상세 approvers 포함 또는 409/방금 동의.
  const [alreadyApproved, setAlreadyApproved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchReport(id)
      .then((report) => {
        if (!alive) return;
        setLoad({ status: "ready", report });
        if (report.crossVerification) {
          setApprovals(report.crossVerification.approvals);
          setRequired(report.crossVerification.required);
        }
      })
      .catch(() => {
        if (alive) setLoad({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // 본인 reviewerId 조회(이미 동의자인지 판별용). 실패해도 화면은 동작.
  useEffect(() => {
    let alive = true;
    fetchMe()
      .then((m) => {
        if (alive && m) setMyId(m.id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 상세 approvers 에 본인이 있으면 이미 동의한 상태.
  useEffect(() => {
    if (load.status !== "ready" || !myId) return;
    const approvers = load.report.crossVerification?.approvers ?? [];
    if (approvers.includes(myId)) setAlreadyApproved(true);
  }, [load, myId]);

  const completed = approvals >= required;

  // 클라이언트 검증: method 비었거나 채워진 근거(URL) 0개면 제출 불가.
  // 근거 블록은 기본 1개 펼쳐두지만, 빈 블록은 근거로 치지 않는다.
  const canSubmit =
    method.trim().length > 0 &&
    evidence.some((e) => e.url.trim().length > 0);

  function updateEvidence(i: number, patch: Partial<EvidenceDraft>) {
    setEvidence((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setFieldErrors([]);
    setFormError(null);

    const evidenceLinks: EvidenceLink[] = evidence.map((ev) => ({
      url: ev.url,
      capturedAt: ev.capturedAt,
      contentHash: ev.contentHash,
      ...(ev.archiveUrl ? { archiveUrl: ev.archiveUrl } : {}),
    }));

    // 0017: 판정 제출 = 이 reviewer 의 검증 동의(verified:true).
    const result = await submitVerification(id, {
      method: method.trim(),
      verified: true,
      evidenceLinks,
      ...(confidence ? { confidence: Number(confidence) } : {}),
      ...(validity ? { validity } : {}),
      ...(severity ? { severity: Number(severity) } : {}),
      ...(notes ? { notes } : {}),
      ...(unverifiedClaims ? { unverifiedClaims } : {}),
    });

    if (result.ok) {
      if (typeof result.approvals === "number") setApprovals(result.approvals);
      if (typeof result.required === "number") setRequired(result.required);
      setAlreadyApproved(true);
      return;
    }
    if (result.error === "already_approved") {
      setAlreadyApproved(true);
      return;
    }
    if (result.error === "validation_error") {
      setFieldErrors(result.fields);
      return;
    }
    if (result.error === "not_found") {
      setFormError("제보를 찾을 수 없습니다.");
      return;
    }
    setFormError("판정 저장에 실패했습니다.");
  }

  if (load.status === "loading")
    return (
      <>
        <Header admin />
        <p>불러오는 중…</p>
      </>
    );
  if (load.status === "error")
    return (
      <>
        <Header admin />
        <p role="alert">제보를 불러오지 못했습니다.</p>
      </>
    );

  const r = load.report;

  return (
    <>
    <Header admin />
    <main className="container container--narrow">
      <h1>{r.title}</h1>
      <div className="meta-row">
        <span>{regionLabel(r)}</span>
        {r.occurredAt && <span> · 발생 {formatDateTime(r.occurredAt)}</span>}
        {r.collectedAt && <span> · 수집 {formatDateTime(r.collectedAt)}</span>}
      </div>
      <p className="detail-body">{r.body}</p>

      <section className="section-card" aria-label="교차검증 진행도">
        <h2>교차검증</h2>
        <p>
          <strong>
            {approvals} / {required}
          </strong>{" "}
          동의
        </p>
        {completed ? (
          <p role="status" className="cross-verify-done">
            검증 완료 (공개됨)
          </p>
        ) : (
          <p>서로 다른 검토자 {required}인의 동의가 모이면 공개됩니다.</p>
        )}
      </section>

      {r.verificationHistory.length > 0 && (
        <section className="section-card">
          <h2>판정 이력</h2>
          <ul>
            {r.verificationHistory.map((h) => (
              <li key={h.version}>
                v{h.version}
                {h.archivedAt && ` · ${formatDateTime(h.archivedAt)}`}
                {typeof h.snapshot.method === "string" &&
                  h.snapshot.method && <> · {h.snapshot.method}</>}
                {typeof h.snapshot.validity === "string" &&
                  h.snapshot.validity && (
                    <> · {validityLabel(h.snapshot.validity)}</>
                  )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section-card">
        <h2>첨부</h2>
        {r.attachments.length === 0 ? (
          <p>첨부 없음</p>
        ) : (
          <ul>
            {r.attachments.map((a) => (
              <li key={a.id}>
                <a href={a.url}>{a.filename}</a>
              </li>
            ))}
          </ul>
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
                <a href={s.url}>{s.url}</a>
                {s.contentHash && (
                  <span
                    title={s.contentHash}
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {" "}
                    (hash: {shortHash(s.contentHash)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-card">
        <h2>판정</h2>
        <form onSubmit={onSubmit}>
          <p>
            <label htmlFor="method">검증 방법</label>
            <br />
            <input
              id="method"
              className="input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            />
          </p>

          <p>
            <label htmlFor="validity">유효성</label>
            <br />
            <select
              id="validity"
              className="input"
              value={validity}
              onChange={(e) => setValidity(e.target.value)}
            >
              <option value="">선택 안 함</option>
              <option value="valid">{validityLabel("valid")}</option>
              <option value="partly">{validityLabel("partly")}</option>
              <option value="invalid">{validityLabel("invalid")}</option>
              <option value="unclear">{validityLabel("unclear")}</option>
            </select>
          </p>

          <p>
            <label htmlFor="severity">심각도 (1–5)</label>
            <br />
            <input
              id="severity"
              className="input"
              type="number"
              min={1}
              max={5}
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            />
          </p>

          <p>
            <label htmlFor="confidence">신뢰도 (0–100)</label>
            <br />
            <input
              id="confidence"
              className="input"
              type="number"
              min={0}
              max={100}
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
            />
          </p>

          <p>
            <label>
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
              />{" "}
              검증됨(verified)으로 표시
            </label>
          </p>

          <p>
            <label htmlFor="notes">메모</label>
            <br />
            <textarea
              id="notes"
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </p>

          <p>
            <label htmlFor="unverified-claims">확인되지 않은 주장</label>
            <br />
            <textarea
              id="unverified-claims"
              className="input"
              value={unverifiedClaims}
              onChange={(e) => setUnverifiedClaims(e.target.value)}
            />
          </p>

          <fieldset>
            <legend>근거 링크 (최소 1개)</legend>
            {evidence.map((ev, i) => (
              <div
                key={i}
                data-testid={`evidence-link-${i}`}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-3)",
                  marginBottom: "var(--space-3)",
                }}
              >
                <p>
                  <label htmlFor={`ev-url-${i}`}>URL</label>
                  <br />
                  <input
                    id={`ev-url-${i}`}
                    className="input"
                    value={ev.url}
                    onChange={(e) => updateEvidence(i, { url: e.target.value })}
                  />
                </p>
                <p>
                  <label htmlFor={`ev-captured-${i}`}>수집 시각</label>
                  <br />
                  <input
                    id={`ev-captured-${i}`}
                    className="input"
                    value={ev.capturedAt}
                    onChange={(e) =>
                      updateEvidence(i, { capturedAt: e.target.value })
                    }
                  />
                </p>
                <p>
                  <label htmlFor={`ev-hash-${i}`}>콘텐츠 해시</label>
                  <br />
                  <input
                    id={`ev-hash-${i}`}
                    className="input"
                    value={ev.contentHash}
                    onChange={(e) =>
                      updateEvidence(i, { contentHash: e.target.value })
                    }
                  />
                </p>
                <p>
                  <label htmlFor={`ev-archive-${i}`}>아카이브 URL (선택)</label>
                  <br />
                  <input
                    id={`ev-archive-${i}`}
                    className="input"
                    value={ev.archiveUrl}
                    onChange={(e) =>
                      updateEvidence(i, { archiveUrl: e.target.value })
                    }
                  />
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setEvidence((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  근거 삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEvidence((prev) => [...prev, emptyEvidence()])}
            >
              근거 링크 추가
            </button>
          </fieldset>

          {!canSubmit && (
            <p role="note" className="text-danger">
              검증 방법과 근거 링크(최소 1개)를 입력해야 제출할 수 있습니다.
            </p>
          )}

          {fieldErrors.length > 0 && (
            <ul role="alert" className="text-danger">
              {fieldErrors.map((f, i) => (
                <li key={i}>
                  {f.field}: {f.reason}
                </li>
              ))}
            </ul>
          )}
          {formError && (
            <p role="alert" className="text-danger">
              {formError}
            </p>
          )}

          {alreadyApproved && !completed && (
            <p role="status" className="text-muted">
              이미 동의하셨습니다.
            </p>
          )}

          <button
            type="submit"
            className="btn btn-approve"
            disabled={!canSubmit || alreadyApproved || completed}
          >
            검증 승인(동의)
          </button>
        </form>
      </section>
    </main>
    </>
  );
}
