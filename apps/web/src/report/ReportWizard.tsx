import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createReport,
  uploadAttachment,
  validateFile,
  type FieldError,
} from "./api";
import {
  sidoList,
  sigunguList,
  eupMyeonDongList,
} from "./regions";
import { inspectAttachment, type BlockReason } from "./exif";
import { categoriesForDomain, type ReportDomain } from "../categories";
import { fetchElections, type Election } from "../elections";
import Header from "../Header";
import TabBar from "../TabBar";
import DomainSegment from "../DomainSegment";
import { addMyReport } from "../track/storage";

const TOTAL_STEPS = 5;
const DRAFT_KEY = "votatis_report_draft";

type Draft = {
  step: number;
  title: string;
  body: string;
  occurredAt: string;
  domain: ReportDomain;
  category: string;
  electionId: string;
  sido: string;
  sigungu: string;
  eupMyeonDong: string;
  sourceUrl: string;
  consent: boolean;
};

// 제출/업로드 진행 상태 (결정2: report 생성 후 첨부 — 순서 유지).
type Progress =
  | { phase: "creating" }
  | { phase: "uploading"; fileName: string }
  | { phase: "uploaded"; fileName: string }
  | { phase: "upload_failed"; fileName: string };

const emptyDraft: Draft = {
  step: 1,
  title: "",
  body: "",
  occurredAt: "",
  domain: "election",
  category: "",
  electionId: "",
  sido: "",
  sigungu: "",
  eupMyeonDong: "",
  sourceUrl: "",
  consent: false,
};

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft;
    return { ...emptyDraft, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    return emptyDraft;
  }
}

export default function ReportWizard() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [elections, setElections] = useState<Election[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // 비원본/위장 파일 차단 화면(0015 화면 11). 통과 시 null.
  const [block, setBlock] = useState<BlockReason | null>(null);
  const [fileWarn, setFileWarn] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<{
    id: string;
    trackingNumber?: string;
    attachment?: { fileName: string; ok: boolean };
  } | null>(null);

  // 선거 선택 옵션 로드(선택 사항 — 실패 시 빈 목록).
  useEffect(() => {
    let alive = true;
    fetchElections().then((items) => {
      if (alive) setElections(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 진행 중 입력을 sessionStorage 에 저장 (새로고침 복원).
  useEffect(() => {
    if (done) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, done]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setStepError(null);
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // 도메인 전환 시 분류는 다른 집합이므로 초기화(전환된 도메인 분류로 다시 선택).
  // 제보폼은 "전체" 옵션이 없어 항상 domain 값이 온다(null 아님).
  function onSelectDomain(value: ReportDomain | null) {
    if (value == null) return;
    setStepError(null);
    setDraft((d) => ({ ...d, domain: value, category: "" }));
  }

  function onSelectSido(value: string) {
    setStepError(null);
    setDraft((d) => ({ ...d, sido: value, sigungu: "", eupMyeonDong: "" }));
  }
  function onSelectSigungu(value: string) {
    setStepError(null);
    setDraft((d) => ({ ...d, sigungu: value, eupMyeonDong: "" }));
  }

  const selectedElectionName =
    elections.find((el) => el.id === draft.electionId)?.name ?? "";

  function stepValid(step: number): boolean {
    switch (step) {
      case 1:
        return draft.title.trim().length > 0;
      default:
        return true; // 분류(2, 미분류 허용)·지역(3)·출처(4)는 선택, 5는 별도 consent 게이트
    }
  }

  function next() {
    if (!stepValid(draft.step)) {
      setStepError("제목을 입력해 주세요");
      return;
    }
    setStepError(null);
    setDraft((d) => ({ ...d, step: Math.min(d.step + 1, TOTAL_STEPS) }));
  }

  function prev() {
    setStepError(null);
    setDraft((d) => ({ ...d, step: Math.max(d.step - 1, 1) }));
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setBlock(null);
    setFileWarn(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    const err = validateFile(f);
    if (err) {
      setFileError(err);
      setFile(null);
      e.target.value = "";
      return;
    }
    // 0015: EXIF 1차 검증 + MIME 이중검증. 비원본/위장은 첨부 차단.
    const verdict = await inspectAttachment(f);
    if (verdict.kind === "blocked") {
      setBlock(verdict.reason);
      setFile(null);
      e.target.value = "";
      return;
    }
    if (verdict.kind === "warn") {
      setFileWarn(
        "사진의 촬영 정보를 확인하지 못했습니다. 직접 촬영한 원본인지 확인해 주세요.",
      );
    }
    setFile(f);
  }

  async function onSubmit() {
    setSubmitError(null);
    setFieldErrors([]);
    setSubmitting(true);
    setProgress({ phase: "creating" });

    const result = await createReport({
      title: draft.title,
      body: draft.body || undefined,
      occurredAt: draft.occurredAt || undefined,
      domain: draft.domain,
      category: draft.category || undefined,
      electionId: draft.electionId || undefined,
      sido: draft.sido || undefined,
      sigungu: draft.sigungu || undefined,
      eupMyeonDong: draft.eupMyeonDong || undefined,
      sources: draft.sourceUrl ? [draft.sourceUrl] : undefined,
      consent: draft.consent,
    });

    if (!result.ok) {
      setSubmitting(false);
      setProgress(null);
      if (result.error === "validation_error") {
        setFieldErrors(result.fields);
      } else if (result.error === "rate_limited") {
        setSubmitError("요청이 많습니다. 잠시 후 다시 시도해 주세요");
      } else {
        setSubmitError("제출에 실패했습니다. 잠시 후 다시 시도해 주세요");
      }
      return;
    }

    // report 생성 후 첨부 업로드 (create→PUT→finalize).
    let attachment: { fileName: string; ok: boolean } | undefined;
    if (file) {
      setProgress({ phase: "uploading", fileName: file.name });
      const up = await uploadAttachment(result.id, file);
      if (up.ok) {
        setProgress({ phase: "uploaded", fileName: file.name });
        attachment = { fileName: file.name, ok: true };
      } else {
        setProgress({ phase: "upload_failed", fileName: file.name });
        attachment = { fileName: file.name, ok: false };
      }
    }

    setSubmitting(false);
    sessionStorage.removeItem(DRAFT_KEY);
    // 접수번호를 "내 제보"(localStorage)에 누적 — 익명 추적용(0013 결정 5).
    if (result.trackingNumber) addMyReport(result.trackingNumber);
    setDone({
      id: result.id,
      trackingNumber: result.trackingNumber,
      attachment,
    });
  }

  async function copyTracking(trackingNumber: string) {
    await navigator.clipboard.writeText(trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function startNewReport() {
    setFile(null);
    setFileError(null);
    setBlock(null);
    setFileWarn(null);
    setStepError(null);
    setFieldErrors([]);
    setSubmitError(null);
    setProgress(null);
    setDone(null);
    setDraft(emptyDraft);
  }

  if (done) {
    return (
      <main style={pageStyle}>
        <div className="done-card">
          <h1>제보가 접수되었습니다</h1>
          {done.trackingNumber ? (
            <>
              <p>접수번호</p>
              <div style={trackingRowStyle}>
                <p className="done-card__tracking">{done.trackingNumber}</p>
                <button
                  type="button"
                  onClick={() => copyTracking(done.trackingNumber!)}
                  style={copyBtnStyle}
                >
                  복사
                </button>
                {copied && (
                  <span role="status" aria-live="polite" style={copiedStyle}>
                    복사됨
                  </span>
                )}
              </div>
            </>
          ) : (
            <p>
              접수 식별자: <span className="done-card__id">{done.id}</span>
            </p>
          )}
        </div>
        {done.trackingNumber && (
          <p style={hintStyle}>
            이 접수번호로 진행 상태를 조회할 수 있습니다. 번호는 "내 제보"에
            저장됩니다.
          </p>
        )}
        {done.attachment && (
          <p style={done.attachment.ok ? progressStyle : errorStyle}>
            {done.attachment.ok
              ? `첨부 업로드 완료 (${done.attachment.fileName})`
              : `첨부 업로드 실패 (${done.attachment.fileName}) — 제보 본문은 정상 접수되었습니다`}
          </p>
        )}
        <p>
          제출하신 내용은 검증 절차를 거친 뒤 공개될 수 있습니다. 검증 결과에
          따라 공개되지 않을 수 있습니다.
        </p>
        <nav className="btn-row">
          {done.trackingNumber && (
            <Link
              to={`/track?number=${encodeURIComponent(done.trackingNumber)}`}
              className="btn btn-primary"
            >
              내 제보 상태 조회하기
            </Link>
          )}
          <a href="/archive" className="btn btn-secondary">
            공개 아카이브 보기
          </a>
          <a href="/" className="btn btn-secondary">
            홈
          </a>
          <button
            type="button"
            onClick={startNewReport}
            className="btn btn-primary"
          >
            새 제보 작성
          </button>
        </nav>
      </main>
    );
  }

  return (
    <>
    <Header />
    <main style={pageStyle}>
      <h1>제보하기</h1>
      <ol className="stepper" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
          <li
            key={n}
            className={
              "stepper__step" +
              (n === draft.step
                ? " stepper__step--current"
                : n < draft.step
                  ? " stepper__step--done"
                  : "")
            }
          >
            {n}
          </li>
        ))}
      </ol>
      <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
        {draft.step} / {TOTAL_STEPS} 단계
      </p>

      {draft.step === 1 && (
        <section style={sectionStyle}>
          <h2>상황 설명</h2>
          <p style={hintStyle}>
            관찰한 사실을 그대로 기록해 주세요. 단정적인 주장보다, 무엇을
            언제 어디서 보았는지 검증 가능한 형태로 적어 주시면 도움이 됩니다.
          </p>
          <label style={labelStyle}>
            제목
            <input
              type="text"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            본문 (무엇을 보았는지)
            <textarea
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              rows={5}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            발생 시점
            <input
              type="datetime-local"
              value={draft.occurredAt}
              onChange={(e) => set("occurredAt", e.target.value)}
              style={inputStyle}
            />
          </label>
        </section>
      )}

      {draft.step === 2 && (
        <section style={sectionStyle}>
          <h2>분류</h2>
          <DomainSegment value={draft.domain} onChange={onSelectDomain} />
          <label style={labelStyle}>
            분류
            <select
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              style={inputStyle}
            >
              <option value="">선택하세요</option>
              {categoriesForDomain(draft.domain).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            선거 (선택)
            <select
              value={draft.electionId}
              onChange={(e) => set("electionId", e.target.value)}
              style={inputStyle}
            >
              <option value="">선택 안 함</option>
              {elections.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {draft.step === 3 && (
        <section style={sectionStyle}>
          <h2>지역 선택</h2>
          <label style={labelStyle}>
            시도
            <select
              value={draft.sido}
              onChange={(e) => onSelectSido(e.target.value)}
              style={inputStyle}
            >
              <option value="">선택하세요</option>
              {sidoList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            시군구
            <select
              value={draft.sigungu}
              onChange={(e) => onSelectSigungu(e.target.value)}
              disabled={!draft.sido}
              style={inputStyle}
            >
              <option value="">선택하세요</option>
              {sigunguList(draft.sido).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            읍면동
            <select
              value={draft.eupMyeonDong}
              onChange={(e) => set("eupMyeonDong", e.target.value)}
              disabled={!draft.sigungu}
              style={inputStyle}
            >
              <option value="">선택하세요</option>
              {eupMyeonDongList(draft.sido, draft.sigungu).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {draft.step === 4 && (
        <section style={sectionStyle}>
          <h2>출처·사진</h2>
          <p style={hintStyle}>
            관련 영상·기사·통계의 출처 링크나, 직접 촬영한 사진/문서를 첨부해
            주세요.
          </p>
          <label style={labelStyle}>
            출처 URL
            <input
              type="url"
              value={draft.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            사진/PDF 첨부
            <input
              id="report-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={onFileChange}
              style={inputStyle}
            />
          </label>
          {file && <p>선택된 파일: {file.name}</p>}
          {fileWarn && (
            <p role="status" style={hintStyle}>
              {fileWarn}
            </p>
          )}
          {fileError && (
            <p role="alert" style={errorStyle}>
              {fileError}
            </p>
          )}
          {block && (
            <div role="alert" style={blockCardStyle}>
              {block === "not_original" ? (
                <>
                  <h3 style={blockTitleStyle}>원본 사진이 아닙니다</h3>
                  <p style={hintStyle}>
                    이 사진에는 카메라가 기록하는 촬영 정보(EXIF)가 없습니다.
                    EXIF 는 촬영 시각·기기 같은 메타데이터로, 직접 찍은 사진에는
                    보통 담겨 있습니다. 스크린샷·캡처본이나 메신저로 전달받은
                    사진은 이 정보가 사라집니다.
                  </p>
                  <p style={hintStyle}>
                    직접 촬영한 원본 사진만 인정됩니다. 캡처본·전달본이 아닌
                    원본 파일을 다시 선택해 주세요.
                  </p>
                </>
              ) : (
                <>
                  <h3 style={blockTitleStyle}>
                    파일 형식이 확장자와 일치하지 않습니다
                  </h3>
                  <p style={hintStyle}>
                    선택한 파일의 실제 형식이 확장자와 달라 첨부할 수 없습니다.
                    원본 파일을 다시 선택해 주세요.
                  </p>
                </>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  document.getElementById("report-file-input")?.click()
                }
              >
                다른 파일 선택
              </button>
            </div>
          )}
        </section>
      )}

      {draft.step === 5 && (
        <section style={sectionStyle}>
          <h2>검토·제출</h2>
          <dl style={{ display: "grid", gap: "0.25rem" }}>
            <div>
              <dt style={dtStyle}>제목</dt>
              <dd style={ddStyle}>{draft.title}</dd>
            </div>
            <div>
              <dt style={dtStyle}>본문</dt>
              <dd style={{ ...ddStyle, whiteSpace: "pre-wrap" }}>
                {draft.body || "없음"}
              </dd>
            </div>
            <div>
              <dt style={dtStyle}>발생 시점</dt>
              <dd style={ddStyle}>{draft.occurredAt || "-"}</dd>
            </div>
            <div>
              <dt style={dtStyle}>분류</dt>
              <dd style={ddStyle}>{draft.category || "-"}</dd>
            </div>
            <div>
              <dt style={dtStyle}>선거</dt>
              <dd style={ddStyle}>{selectedElectionName || "-"}</dd>
            </div>
            <div>
              <dt style={dtStyle}>지역</dt>
              <dd style={ddStyle}>
                {[draft.sido, draft.sigungu, draft.eupMyeonDong]
                  .filter(Boolean)
                  .join(" ") || "-"}
              </dd>
            </div>
            <div>
              <dt style={dtStyle}>출처 URL</dt>
              <dd style={ddStyle}>{draft.sourceUrl || "없음"}</dd>
            </div>
            <div>
              <dt style={dtStyle}>첨부</dt>
              <dd style={ddStyle}>{file ? file.name : "없음"}</dd>
            </div>
          </dl>

          <p style={hintStyle}>
            제출하신 내용은 검증 절차를 거친 뒤 공개될 수 있습니다.
          </p>
          <label
            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={draft.consent}
              onChange={(e) => set("consent", e.target.checked)}
            />
            제출 및 검증 목적의 활용에 동의합니다 (CC BY 라이선스)
          </label>
          {!draft.consent && (
            <p style={hintStyle}>제출하려면 동의가 필요합니다.</p>
          )}

          {progress && (
            <p role="status" aria-live="polite" style={progressStyle}>
              {progress.phase === "creating" && "제보 접수 중…"}
              {progress.phase === "uploading" &&
                `첨부 업로드 중… (${progress.fileName})`}
              {progress.phase === "uploaded" &&
                `첨부 업로드 완료 (${progress.fileName})`}
              {progress.phase === "upload_failed" &&
                `첨부 업로드 실패 (${progress.fileName})`}
            </p>
          )}
          {fieldErrors.length > 0 && (
            <ul role="alert" style={errorStyle}>
              {fieldErrors.map((f) => (
                <li key={f.field}>{f.reason}</li>
              ))}
            </ul>
          )}
          {submitError && (
            <p role="alert" style={errorStyle}>
              {submitError}
            </p>
          )}
        </section>
      )}

      {stepError && (
        <p role="alert" style={errorStyle}>
          {stepError}
        </p>
      )}

      <div className="btn-row">
        {draft.step > 1 && (
          <button type="button" onClick={prev} className="btn btn-secondary">
            이전
          </button>
        )}
        {draft.step < TOTAL_STEPS && (
          <button type="button" onClick={next} className="btn btn-primary">
            다음
          </button>
        )}
        {draft.step === TOTAL_STEPS && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!draft.consent || submitting}
            className="btn btn-primary"
          >
            제출
          </button>
        )}
      </div>
    </main>
    <TabBar />
    </>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: "var(--container-max)",
  minHeight: "100vh",
  margin: "0 auto",
  padding:
    "var(--space-5) var(--space-4) calc(var(--tab-bar-height) + var(--space-6))",
  background: "var(--color-bg)",
  boxSizing: "border-box",
};
const sectionStyle: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-3)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-4)",
};
const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-1)",
  fontSize: "var(--text-sm)",
};
const inputStyle: React.CSSProperties = {
  padding: "var(--space-2)",
  fontSize: "var(--text-base)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
};
const hintStyle: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
};
const errorStyle: React.CSSProperties = {
  color: "var(--color-danger)",
  margin: 0,
};
const blockCardStyle: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-2)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-danger)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-4)",
};
const blockTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--color-danger)",
  fontSize: "var(--text-base)",
};
const progressStyle: React.CSSProperties = {
  color: "var(--color-text)",
  margin: 0,
  fontSize: "var(--text-sm)",
};
const trackingRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  flexWrap: "wrap",
};
const copyBtnStyle: React.CSSProperties = {
  padding: "var(--space-1) var(--space-2)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};
const copiedStyle: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};
const dtStyle: React.CSSProperties = {
  fontWeight: "var(--weight-medium)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};
const ddStyle: React.CSSProperties = { margin: 0 };
