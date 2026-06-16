import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createReport,
  uploadAttachment,
  validateFile,
  reverseGeocode,
  type FieldError,
} from "./api";
import { sidoList } from "./regions";
import { inspectAttachment, extractGps, type BlockReason } from "./exif";
import { categoriesForDomain, type ReportDomain } from "../categories";
import { fetchElections, type Election } from "../elections";
import TabBar from "../TabBar";
import DomainSegment from "../DomainSegment";
import { addMyReport } from "../track/storage";

// 제보폼 단일 페이지(스펙 0019, Figma 02). 위저드 단계 없이 한 화면에서 작성·제출.
const DRAFT_KEY = "votatis_report_draft";
const MAX_FILES = 5;

type Draft = {
  body: string;
  occurredAt: string;
  domain: ReportDomain;
  category: string;
  electionId: string;
  // Figma 02 위치: 단일 입력칸("시/도·구/군·투표소명"). 제출 시 앞부분에서 시도를 파싱해 구조화 보존.
  location: string;
  sourceUrl: string;
  consent: boolean;
};

type Progress =
  | { phase: "creating" }
  | { phase: "uploading"; fileName: string }
  | { phase: "uploaded"; fileName: string }
  | { phase: "upload_failed"; fileName: string };

// 미리보기용 첨부 항목(파일 + EXIF 경고 여부).
type Picked = { file: File; warn: boolean; previewUrl?: string };

// 이미지 파일의 로컬 미리보기 object URL(jsdom 등 미지원 환경 가드).
function makePreviewUrl(f: File): string | undefined {
  if (!f.type.startsWith("image/")) return undefined;
  if (typeof URL.createObjectURL !== "function") return undefined;
  return URL.createObjectURL(f);
}
function revokePreview(p: Picked): void {
  if (p.previewUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(p.previewUrl);
  }
}

const emptyDraft: Draft = {
  body: "",
  occurredAt: "",
  domain: "election",
  category: "",
  electionId: "",
  location: "",
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

function domainLabel(d: ReportDomain): string {
  return d === "assembly" ? "집회 현장" : "선거 의혹";
}

// 제목 필드는 Figma 02에 없으므로 노출하지 않고 입력값에서 자동 생성(백엔드 필수).
function deriveTitle(d: Draft): string {
  const firstLine = d.body.trim().split("\n")[0]?.slice(0, 60);
  if (firstLine) return firstLine;
  if (d.category) return `${d.category} 제보`;
  return `${domainLabel(d.domain)} 제보`;
}

// 위치 입력 앞부분이 알려진 시도로 시작하면 sido 로 구조화(지도·지역 필터용).
function parseSido(location: string): string | undefined {
  const t = location.trim();
  return sidoList.find((s) => t.startsWith(s));
}

export default function ReportWizard() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [elections, setElections] = useState<Election[]>([]);
  const [files, setFiles] = useState<Picked[]>([]);
  // 언마운트 시 남은 미리보기 object URL 정리(누수 방지).
  const filesRef = useRef<Picked[]>([]);
  filesRef.current = files;
  useEffect(
    () => () => {
      for (const p of filesRef.current) revokePreview(p);
    },
    [],
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [block, setBlock] = useState<BlockReason | null>(null);
  // 0021: 위치 자동입력 출처. "exif-gps"=사진 GPS / "geolocation"=현재 위치 / null=수동.
  const [locSource, setLocSource] = useState<"exif-gps" | "geolocation" | null>(
    null,
  );
  // 현재 위치 채우기 진행/결과 안내.
  const [geoLocating, setGeoLocating] = useState(false);
  const [geoLocateMsg, setGeoLocateMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<{
    id: string;
    trackingNumber?: string;
    attachment?: { fileName: string; ok: boolean; count: number };
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchElections().then((items) => {
      if (alive) setElections(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (done) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, done]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function onSelectDomain(value: ReportDomain | null) {
    if (value == null) return;
    setDraft((d) => ({ ...d, domain: value, category: "" }));
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setBlock(null);
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;

    const added: Picked[] = [];
    for (const f of selected) {
      if (files.length + added.length >= MAX_FILES) break;
      const err = validateFile(f);
      if (err) {
        setFileError(err);
        continue;
      }
      // 0015: EXIF 1차 검증 + MIME 이중검증. 비원본/위장은 첨부 차단.
      const verdict = await inspectAttachment(f);
      if (verdict.kind === "blocked") {
        setBlock(verdict.reason);
        continue;
      }
      added.push({
        file: f,
        warn: verdict.kind === "warn",
        previewUrl: makePreviewUrl(f),
      });
    }
    if (added.length > 0) setFiles((prev) => [...prev, ...added].slice(0, MAX_FILES));

    // 0021: 사용자가 위치를 아직 안 적었으면, 첨부 사진의 EXIF GPS 로 시군구 자동 입력.
    // GPS 없거나 역지오코딩 미매칭이면 조용히 넘어간다(수동 입력 우선, 덮어쓰지 않음).
    if (!draft.location.trim()) {
      for (const p of added) {
        const gps = await extractGps(p.file);
        if (!gps) continue;
        const region = await reverseGeocode(gps.lat, gps.lng);
        if (region) {
          set("location", `${region.sido} ${region.sigungu}`);
          setLocSource("exif-gps");
        }
        break;
      }
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const target = prev[index];
      if (target) revokePreview(target);
      return prev.filter((_, i) => i !== index);
    });
  }

  // 0021 보완: 폰 현재 위치로 시군구 채우기(사진 GPS 가 막힌 모바일용). Geolocation API.
  function fillFromCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoLocateMsg("이 브라우저에서 위치를 사용할 수 없습니다");
      return;
    }
    setGeoLocateMsg(null);
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const region = await reverseGeocode(
            pos.coords.latitude,
            pos.coords.longitude,
          );
          if (region) {
            set("location", `${region.sido} ${region.sigungu}`);
            setLocSource("geolocation");
          } else {
            setGeoLocateMsg("현재 위치의 시군구를 찾지 못했습니다");
          }
        } finally {
          setGeoLocating(false);
        }
      },
      () => {
        setGeoLocating(false);
        setGeoLocateMsg("위치 권한이 거부되었거나 가져오지 못했습니다");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function onSubmit() {
    setSubmitError(null);
    setFieldErrors([]);
    setSubmitting(true);
    setProgress({ phase: "creating" });

    const result = await createReport({
      title: deriveTitle(draft),
      body: draft.body || undefined,
      occurredAt: draft.occurredAt || undefined,
      domain: draft.domain,
      category: draft.category || undefined,
      electionId: draft.electionId || undefined,
      sido: parseSido(draft.location),
      sigungu: draft.location || undefined,
      // 0021: 위치가 사진 GPS 로 자동입력된 상태면 출처 표식 전송(사용자가 수정하면 해제됨).
      locationSource: locSource ?? undefined,
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

    let attachment: { fileName: string; ok: boolean; count: number } | undefined;
    if (files.length > 0) {
      let okCount = 0;
      for (const { file } of files) {
        setProgress({ phase: "uploading", fileName: file.name });
        const up = await uploadAttachment(result.id, file);
        if (up.ok) okCount += 1;
      }
      const allOk = okCount === files.length;
      setProgress({
        phase: allOk ? "uploaded" : "upload_failed",
        fileName: files[0].file.name,
      });
      attachment = { fileName: files[0].file.name, ok: allOk, count: files.length };
    }

    setSubmitting(false);
    sessionStorage.removeItem(DRAFT_KEY);
    // 내 제보(이 기기) — 제출 시점 메타를 함께 저장(서버 매핑 없음, 익명 유지).
    if (result.trackingNumber)
      addMyReport({
        number: result.trackingNumber,
        title: deriveTitle(draft),
        domain: draft.domain,
        createdAt: new Date().toISOString(),
      });
    setDone({ id: result.id, trackingNumber: result.trackingNumber, attachment });
  }

  async function copyTracking(trackingNumber: string) {
    await navigator.clipboard.writeText(trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // EXIF/위장 차단 전용 화면(Figma 11). 폼 대신 전체화면으로 안내.
  if (block) {
    const notOriginal = block === "not_original";
    return (
      <>
        <main className="container">
          <div className="page-head">
            <button
              type="button"
              className="page-back"
              aria-label="제보폼으로"
              onClick={() => setBlock(null)}
            >
              ←
            </button>
            <h1 className="page-head__title">파일 업로드</h1>
          </div>

          <div className="exif-block">
            <div className="exif-block__icon" aria-hidden="true">
              🚫
            </div>
            <h2 className="exif-block__title">
              {notOriginal
                ? "원본 사진이 아닙니다"
                : "파일 형식이 확장자와 일치하지 않습니다"}
            </h2>
            <p className="exif-block__desc">
              {notOriginal
                ? "업로드하신 파일에 EXIF 정보가 없습니다. 캡처·메신저로 전달받은 사진은 제보로 인정되지 않습니다."
                : "선택한 파일의 실제 형식이 확장자와 달라 첨부할 수 없습니다. 원본 파일을 다시 선택해 주세요."}
            </p>

            <div className="exif-reason">
              <p className="exif-reason__title">EXIF란?</p>
              <p className="exif-reason__body">
                카메라로 직접 촬영한 사진에 자동으로 기록되는 촬영 시각·GPS·기기
                정보입니다. 캡처·다운로드·메신저 전달 시 이 정보가 제거됩니다.
                Votatis는 포렌식 검증을 위해 EXIF가 있는 원본 파일만 접수합니다.
              </p>
            </div>

            <input
              id="exif-retry-input"
              className="upload-zone__input"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-label="사진/PDF 첨부"
              onChange={onFileChange}
            />
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => document.getElementById("exif-retry-input")?.click()}
            >
              📷 원본 사진으로 다시 올리기
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => setBlock(null)}
            >
              ← 제보폼으로 돌아가기
            </button>
          </div>
        </main>
        <TabBar />
      </>
    );
  }

  if (done) {
    const att = done.attachment;
    return (
      <>
        <main className="container">
          <div className="done-card">
            <h1>제보가 접수되었습니다</h1>
            {done.trackingNumber ? (
              <>
                <p>접수번호</p>
                <div className="tracking-row">
                  <p className="done-card__tracking">{done.trackingNumber}</p>
                  <button
                    type="button"
                    onClick={() => copyTracking(done.trackingNumber!)}
                    className="btn btn-secondary btn-sm"
                  >
                    복사
                  </button>
                  {copied && (
                    <span role="status" aria-live="polite" className="page-intro">
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
            {done.trackingNumber && (
              <p>이 접수번호로 검수 진행 상태를 확인할 수 있습니다.</p>
            )}
            {att && (
              <p className={att.ok ? "" : "text-danger"}>
                {att.ok
                  ? `첨부 업로드 완료 (${att.fileName}${att.count > 1 ? ` 외 ${att.count - 1}개` : ""})`
                  : `첨부 업로드 실패 (${att.fileName}) — 제보 본문은 정상 접수되었습니다`}
              </p>
            )}
          </div>
          <nav className="hero__cta">
            {done.trackingNumber && (
              <Link
                to={`/track?number=${encodeURIComponent(done.trackingNumber)}`}
                className="btn btn-primary btn-block"
              >
                내 제보 상태 조회하기 →
              </Link>
            )}
            <Link to="/" className="btn btn-secondary btn-block">
              홈으로 돌아가기
            </Link>
          </nav>
        </main>
        <TabBar />
      </>
    );
  }

  return (
    <>
      <main className="container">
        <div className="page-head">
          <Link to="/" className="page-back" aria-label="홈으로">
            ←
          </Link>
          <h1 className="page-head__title">{domainLabel(draft.domain)} 증거 제보</h1>
        </div>
        <p className="page-intro">
          제보는 관리자 검수 후 처리됩니다. 허위 제보는 법적 책임이 따를 수
          있습니다.
        </p>

        <div className="form-grid">
          <DomainSegment value={draft.domain} onChange={onSelectDomain} variant="solid" />

          {/* 사진/PDF 첨부 — 직접 촬영 원본만(0015) */}
          <div className="upload-zone">
            <label className="upload-zone__drop">
              <input
                id="report-file-input"
                className="upload-zone__input"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                aria-label="사진/PDF 첨부"
                onChange={onFileChange}
              />
              <span className="upload-zone__title">📷 사진 촬영 / 갤러리</span>
              <span className="upload-zone__hint upload-zone__hint--strong">
                직접 촬영한 원본 사진만 가능합니다
              </span>
              <span className="upload-zone__hint">
                캡처·메신저로 받은 사진은 인정되지 않습니다
              </span>
            </label>

            <p className="upload-caption">
              📷 원본 사진·영상만 가능 · EXIF 메타데이터 필요
            </p>

            {files.length > 0 && (
              <>
                <div className="upload-grid">
                  {files.map((p, i) => (
                    <div key={`${p.file.name}-${i}`} className="upload-thumb">
                      {p.previewUrl ? (
                        <img
                          className="upload-thumb__img"
                          src={p.previewUrl}
                          alt=""
                          aria-hidden="true"
                        />
                      ) : (
                        <div className="upload-thumb__img" aria-hidden="true" />
                      )}
                      <button
                        type="button"
                        className="upload-thumb__x"
                        aria-label={`${p.file.name} 제거`}
                        onClick={() => removeFile(i)}
                      >
                        ×
                      </button>
                      <span className="upload-thumb__name">{p.file.name}</span>
                      <span
                        className={
                          "upload-thumb__exif" +
                          (p.warn ? " upload-thumb__exif--warn" : "")
                        }
                      >
                        {p.warn ? "⚠ EXIF" : "✓ EXIF"}
                      </span>
                    </div>
                  ))}
                  <span className="upload-limit">
                    {files.length}/{MAX_FILES}장 · 파일당 50MB
                  </span>
                </div>
              </>
            )}
            {fileError && (
              <p role="alert" className="text-danger">
                {fileError}
              </p>
            )}
          </div>

          {/* 위치: 단일 입력칸(Figma 02). 0021: 사진 GPS / 현재 위치로 자동 채움(수정 가능). */}
          <label className="field">
            <span className="field__label">위치 *</span>
            <input
              className="input"
              type="text"
              aria-label="위치"
              value={draft.location}
              onChange={(e) => {
                set("location", e.target.value);
                if (locSource) setLocSource(null);
              }}
              placeholder="📍 시/도 · 구/군 · 투표소명 (GPS 자동)"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm location-geo-btn"
              onClick={fillFromCurrentLocation}
              disabled={geoLocating}
            >
              {geoLocating ? "위치 확인 중…" : "📍 현재 위치로 채우기"}
            </button>
            {locSource === "exif-gps" && (
              <p className="field__hint">📍 사진 위치에서 자동 입력됨 · 수정 가능</p>
            )}
            {locSource === "geolocation" && (
              <p className="field__hint">📍 현재 위치에서 입력됨 · 수정 가능</p>
            )}
            {geoLocateMsg && (
              <p className="field__hint" role="alert">
                {geoLocateMsg}
              </p>
            )}
          </label>

          {/* 의혹 유형(분류) */}
          <label className="field">
            <span className="field__label">
              의혹 유형 <span aria-hidden="true">*</span>
            </span>
            <select
              className="input"
              aria-label="의혹 유형"
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">선택하세요</option>
              {categoriesForDomain(draft.domain).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {/* 상세 설명(본문) */}
          <label className="field">
            <span className="field__label">상세 설명</span>
            <textarea
              className="input"
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              rows={5}
              placeholder="발견 상황을 구체적으로 적어주세요"
            />
          </label>

          {/* 추가 정보(선택) — Figma 02엔 없는 보강 필드는 접어둔다 */}
          <details className="more-data">
            <summary className="more-data__summary">추가 정보 (선택)</summary>
            <div className="form-grid">
              <label className="field">
                선거
                <select
                  className="input"
                  value={draft.electionId}
                  onChange={(e) => set("electionId", e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {elections.map((el) => (
                    <option key={el.id} value={el.id}>
                      {el.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                발생 시점
                <input
                  className="input"
                  type="datetime-local"
                  value={draft.occurredAt}
                  onChange={(e) => set("occurredAt", e.target.value)}
                />
              </label>
              <label className="field">
                출처 URL
                <input
                  className="input"
                  type="url"
                  value={draft.sourceUrl}
                  onChange={(e) => set("sourceUrl", e.target.value)}
                />
              </label>
            </div>
          </details>

          {/* 동의 */}
          <label className="consent-row">
            <input
              type="checkbox"
              checked={draft.consent}
              onChange={(e) => set("consent", e.target.checked)}
            />
            제보 내용이 사실임을 확인하며, 위치·기기 정보 수집에 동의합니다
          </label>

          {progress && (
            <p role="status" aria-live="polite" className="page-intro">
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
            <ul role="alert" className="text-danger">
              {fieldErrors.map((f) => (
                <li key={f.field}>{f.reason}</li>
              ))}
            </ul>
          )}
          {submitError && (
            <p role="alert" className="text-danger">
              {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={!draft.consent || submitting}
            className="btn btn-primary btn-block"
          >
            제보 제출
          </button>
        </div>
      </main>
      <TabBar />
    </>
  );
}
