import { useEffect, useState } from "react";
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
import { REPORT_CATEGORIES } from "../categories";
import { fetchElections, type Election } from "../elections";

// 분류(category)는 서버 enum(스펙 0007)과 동일 출처. value=label(한글 enum 값 그대로 전송).
const categories = REPORT_CATEGORIES;

const TOTAL_STEPS = 5;
const DRAFT_KEY = "votatis_report_draft";

type Draft = {
  step: number;
  title: string;
  body: string;
  occurredAt: string;
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
  const [stepError, setStepError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [done, setDone] = useState<{
    id: string;
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

  function onSelectSido(value: string) {
    setStepError(null);
    setDraft((d) => ({ ...d, sido: value, sigungu: "", eupMyeonDong: "" }));
  }
  function onSelectSigungu(value: string) {
    setStepError(null);
    setDraft((d) => ({ ...d, sigungu: value, eupMyeonDong: "" }));
  }

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

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
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
    setDone({ id: result.id, attachment });
  }

  if (done) {
    return (
      <main style={pageStyle}>
        <h1>제보가 접수되었습니다</h1>
        <p>접수번호: {done.id}</p>
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
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <h1>제보하기</h1>
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
          <label style={labelStyle}>
            분류
            <select
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              style={inputStyle}
            >
              <option value="">선택하세요</option>
              {categories.map((c) => (
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
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={onFileChange}
              style={inputStyle}
            />
          </label>
          {file && <p>선택된 파일: {file.name}</p>}
          {fileError && (
            <p role="alert" style={errorStyle}>
              {fileError}
            </p>
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
              <dt style={dtStyle}>분류</dt>
              <dd style={ddStyle}>{draft.category || "-"}</dd>
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

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        {draft.step > 1 && (
          <button type="button" onClick={prev} style={buttonStyle}>
            이전
          </button>
        )}
        {draft.step < TOTAL_STEPS && (
          <button type="button" onClick={next} style={buttonStyle}>
            다음
          </button>
        )}
        {draft.step === TOTAL_STEPS && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!draft.consent || submitting}
            style={buttonStyle}
          >
            제출
          </button>
        )}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: 640,
  margin: "var(--space-6) auto",
  padding: "0 var(--space-4)",
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
const buttonStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-5)",
  fontSize: "var(--text-base)",
  cursor: "pointer",
};
const hintStyle: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "var(--text-sm)",
};
const errorStyle: React.CSSProperties = {
  color: "var(--color-danger)",
  margin: 0,
};
const progressStyle: React.CSSProperties = {
  color: "var(--color-text)",
  margin: 0,
  fontSize: "var(--text-sm)",
};
const dtStyle: React.CSSProperties = {
  fontWeight: "var(--weight-medium)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};
const ddStyle: React.CSSProperties = { margin: 0 };
