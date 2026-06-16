import { Hono } from "hono";
import type { Db } from "./db/repository.js";
import type { StoragePort } from "./storage.js";
import { createReport, createSource } from "./db/repository.js";
import {
  hashSubmitter,
  isIntakeRateLimited,
  recordIntakeAttempt,
  reportExists,
  electionExists,
  createPendingAttachment,
  finalizeAttachment,
  getStoredAttachmentForVerifiedReport,
  listVerifiedReports,
  getVerifiedReport,
  listElections,
  getReportByTrackingNumber,
  mapStats,
  incrementViewCount,
} from "./db/intake.js";
import { firstImageThumbKeys } from "./db/thumbnails.js";
import { isReportCategory, isReportDomain, type ReportDomain } from "./categories.js";
import { currentStage, buildTimeline } from "./tracking.js";
import { ORIGINAL_PREFIX } from "./mosaic.js";

// 접수번호 형식(0013). 무차별 조회 시 형식 불일치는 DB 조회 전 컷.
const TRACKING_RE = /^VT-\d{4}-\d{4}-\d{4}$/;

// 첨부 허용 정책 (스펙 결정 6).
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_SIZE = 15 * 1024 * 1024; // 15MB
const PRESIGN_TTL_SECONDS = 5 * 60; // 5분 (결정 3)

type Env = { Variables: { db: Db } };

// 공개 직렬화: submitter 해시·verification 내부 필드·원 IP 등 민감정보 제외.
function publicReport(r: {
  id: string;
  title: string;
  body: string | null;
  sido: string | null;
  sigungu: string | null;
  eupMyeonDong: string | null;
  category: string | null;
  electionId: string | null;
  domain: string;
  occurredAt: Date | null;
  collectedAt: Date;
  viewCount: number;
}) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    sido: r.sido,
    sigungu: r.sigungu,
    eupMyeonDong: r.eupMyeonDong,
    category: r.category,
    electionId: r.electionId,
    domain: r.domain,
    occurredAt: r.occurredAt,
    collectedAt: r.collectedAt,
    viewCount: r.viewCount,
  };
}

type SourceInput = {
  kind?: string;
  url?: string;
  capturedAt?: string;
  contentHash?: string;
  archiveUrl?: string;
  snapshotRef?: string;
};

type CreateReportBody = {
  title?: string;
  body?: string;
  sido?: string;
  sigungu?: string;
  eupMyeonDong?: string;
  occurredAt?: string;
  category?: string;
  electionId?: string;
  domain?: string;
  consent?: boolean;
  license?: string;
  // 위치 출처(0021). 클라가 EXIF GPS 자동입력 시 "exif-gps" 전송. 그 외는 무시(수동).
  locationSource?: string;
  sources?: SourceInput[];
  // honeypot: 봇이 채우면 거부(결정 5). 사람은 비워둠.
  website?: string;
};

export function createReportApp(opts: {
  db: Db;
  storage: StoragePort;
  submitterSalt?: string;
  bucketPrefix?: string;
}) {
  const { db, storage } = opts;
  const submitterSalt = opts.submitterSalt ?? "votatis-submitter-salt";
  const bucketPrefix = opts.bucketPrefix ?? "reports";
  const app = new Hono<Env>();

  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  // 클라이언트 IP (프록시 헤더 우선). 식별정보는 해시로만 사용.
  const clientIp = (c: { req: { header: (k: string) => string | undefined } }) =>
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // A1. 제보 생성
  app.post("/reports", async (c) => {
    const ip = clientIp(c);
    if (await isIntakeRateLimited(db, ip)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    await recordIntakeAttempt(db, ip);

    let body: CreateReportBody;
    try {
      body = await c.req.json<CreateReportBody>();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    // honeypot 채워졌으면 봇으로 간주(성공처럼 보이되 저장 안 함은 과한 추상화 →
    // 단순 400 으로 거부).
    if (body.website) {
      return c.json({ error: "rejected", fields: ["website"] }, 400);
    }

    const errors: Record<string, string> = {};
    if (!body.title || typeof body.title !== "string") errors.title = "required";

    // 0014: domain 은 {election, assembly} 집합. 미지정 시 election 기본.
    if (body.domain != null && !isReportDomain(body.domain)) {
      errors.domain = "invalid";
    }
    const domain: ReportDomain = isReportDomain(body.domain) ? body.domain : "election";

    // 0007/0014: category 는 도메인별 고정 enum 집합에 속할 때만(허용 외 → 400).
    if (body.category != null && !isReportCategory(body.category, domain)) {
      errors.category = "invalid";
    }
    // 0007: electionId 가 있으면 실재해야 한다(없는 FK → 500 대신 400).
    if (body.electionId != null && !(await electionExists(db, body.electionId))) {
      errors.electionId = "not_found";
    }

    // source 무결성 사전 검증(0001): captured_at + content_hash 필수.
    const sources = body.sources ?? [];
    sources.forEach((s, i) => {
      if (!s.kind) errors[`sources.${i}.kind`] = "required";
      if (!s.capturedAt) errors[`sources.${i}.capturedAt`] = "required";
      if (!s.contentHash) errors[`sources.${i}.contentHash`] = "required";
    });

    if (Object.keys(errors).length > 0) {
      return c.json({ error: "validation_error", fields: errors }, 400);
    }

    // collected_at 은 0001 계층에서 서버 시각 자동 기록(클라이언트 시각 불신).
    const created = await createReport(db, {
      title: body.title!,
      body: body.body,
      sido: body.sido,
      sigungu: body.sigungu,
      eupMyeonDong: body.eupMyeonDong,
      // 서버 권위: 허용된 출처 값만 저장(그 외는 수동=null).
      locationSource:
        body.locationSource === "exif-gps" || body.locationSource === "geolocation"
          ? body.locationSource
          : undefined,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      category: body.category,
      electionId: body.electionId,
      domain,
      consent: body.consent,
      license: body.license,
      status: "submitted",
      submitter: hashSubmitter(ip, submitterSalt),
    });

    for (const s of sources) {
      await createSource(db, {
        reportId: created.id,
        kind: s.kind!,
        url: s.url,
        capturedAt: new Date(s.capturedAt!),
        contentHash: s.contentHash!,
        archiveUrl: s.archiveUrl,
        snapshotRef: s.snapshotRef,
      });
    }

    return c.json(
      { id: created.id, status: created.status, trackingNumber: created.trackingNumber },
      201,
    );
  });

  // B4. 공개 상태조회(0013) — 인증 없이 접수번호로 단건. 민감정보 0(타임라인만).
  // 형식 불일치/없는 번호 모두 404(존재 누설 방지). IP rate limit 적용.
  app.get("/track/:number", async (c) => {
    const ip = clientIp(c);
    if (await isIntakeRateLimited(db, ip)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    await recordIntakeAttempt(db, ip);

    const number = c.req.param("number");
    if (!TRACKING_RE.test(number)) {
      return c.json({ error: "not_found" }, 404);
    }
    const row = await getReportByTrackingNumber(db, number);
    if (!row) return c.json({ error: "not_found" }, 404);

    const stage = currentStage({ status: row.status, vVerified: row.vVerified });
    // verified=true(공개)면 0005 공개 상세 경로. 아니면 publicUrl 없음(null).
    const publicUrl = row.vVerified === true ? `/reports/${row.id}` : null;

    return c.json({
      trackingNumber: row.trackingNumber,
      timeline: buildTimeline(stage),
      currentStage: stage,
      publicUrl,
    });
  });

  // A2. 첨부 create → presigned PUT URL + attachment(status=pending)
  app.post("/reports/:id/attachments/create", async (c) => {
    const ip = clientIp(c);
    if (await isIntakeRateLimited(db, ip)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    await recordIntakeAttempt(db, ip);

    const reportId = c.req.param("id");
    let body: { filename?: string; mime?: string; size?: number; sha256?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    if (!body.mime || !ALLOWED_MIME.has(body.mime)) {
      return c.json({ error: "unsupported_media_type", allowed: [...ALLOWED_MIME] }, 400);
    }
    if (typeof body.size !== "number" || body.size <= 0) {
      return c.json({ error: "invalid_size" }, 400);
    }
    if (body.size > MAX_SIZE) {
      return c.json({ error: "payload_too_large", maxSize: MAX_SIZE }, 413);
    }

    // 존재하지 않는 report 면 FK 위반 500 노출 대신 404.
    if (!(await reportExists(db, reportId))) {
      return c.json({ error: "not_found" }, 404);
    }

    const ext = body.filename?.split(".").pop()?.toLowerCase();
    // 0016: 원본은 original/ prefix 아래 생성(공개본은 공표 처리에서 public/ 로 분리).
    const storageKey = `${ORIGINAL_PREFIX}${bucketPrefix}/${reportId}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;

    const att = await createPendingAttachment(db, {
      reportId,
      storageKey,
      filename: body.filename,
      mime: body.mime,
      size: body.size,
      expectedSha256: body.sha256,
    });

    const presigned = await storage.presignPut({
      key: storageKey,
      contentType: body.mime,
      contentLength: body.size,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    });

    return c.json(
      {
        attachmentId: att.id,
        storageKey,
        uploadUrl: presigned.url,
        method: "PUT",
        expiresInSeconds: presigned.expiresInSeconds,
        status: att.status,
      },
      201,
    );
  });

  // A3. 첨부 finalize → 객체 존재·크기 확인 후 sha256 확정 + status=stored
  app.post("/reports/:id/attachments/:attachmentId/finalize", async (c) => {
    const reportId = c.req.param("id");
    const attachmentId = c.req.param("attachmentId");

    const outcome = await finalizeAttachment(db, {
      reportId,
      attachmentId,
      headObject: (key) => storage.headObject(key),
    });

    if (!outcome.ok) {
      if (outcome.reason === "not_found") return c.json({ error: "not_found" }, 404);
      if (outcome.reason === "already_stored") {
        return c.json({ error: "already_stored" }, 409);
      }
      // object_missing | mismatch → 409 (무결성 위반)
      return c.json({ error: outcome.reason }, 409);
    }

    return c.json({
      attachmentId: outcome.attachment.id,
      sha256: outcome.attachment.sha256,
      size: outcome.attachment.size,
      status: outcome.attachment.status,
    });
  });

  // A4. 공개 첨부 다운로드 — on-demand presigned GET URL 발급(0008).
  // 게이트(서버 단일 지점 강제): report.verified ∧ attachment.stored ∧ 소속 일치.
  // 미충족(미검증·pending·소속불일치·없음)은 모두 404(존재 누설 금지).
  app.get("/reports/:id/attachments/:attachmentId/download", async (c) => {
    const row = await getStoredAttachmentForVerifiedReport(db, {
      reportId: c.req.param("id"),
      attachmentId: c.req.param("attachmentId"),
    });
    if (!row) return c.json({ error: "not_found" }, 404);

    // 0016 공개 게이트: assembly 는 모자이크된 공개본(publicKey)만 노출. 원본 storageKey
    // (original/...) 는 절대 외부 미노출. publicKey 미처리(null) → 404(fail-closed).
    // election 은 기존 0008 동작 그대로(storageKey 발급).
    const key = row.domain === "assembly" ? row.publicKey : row.storageKey;
    if (!key) return c.json({ error: "not_found" }, 404);

    const presigned = await storage.presignGet({
      key,
      expiresInSeconds: PRESIGN_TTL_SECONDS,
    });
    // storageKey 등 민감 메타는 비노출 — URL·만료만 반환.
    return c.json({ url: presigned.url, expiresInSeconds: presigned.expiresInSeconds });
  });

  // B1. 공개 목록 — verified=true 만
  app.get("/reports", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
    const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
    const q = c.req.query("q") || undefined;
    const sido = c.req.query("sido") || undefined;
    const category = c.req.query("category") || undefined;
    const electionId = c.req.query("electionId") || undefined;
    const domain = c.req.query("domain") || undefined;

    const { rows, total } = await listVerifiedReports(db, {
      limit,
      offset,
      q,
      sido,
      category,
      electionId,
      domain,
    });
    // 리스트 썸네일: 공개 게이트(assembly=publicKey, election=storageKey) 적용한
    // 첫 이미지 첨부 presigned URL. (원본 original/ 키는 assembly 에서 절대 미노출)
    const thumbs = await firstImageThumbKeys(
      db,
      rows.map((r) => ({ id: r.id, domain: r.domain })),
      { gate: true },
    );
    const items = await Promise.all(
      rows.map(async (r) => ({
        ...publicReport(r),
        thumbnailUrl: thumbs.has(r.id)
          ? (
              await storage.presignGet({
                key: thumbs.get(r.id)!,
                expiresInSeconds: PRESIGN_TTL_SECONDS,
              })
            ).url
          : undefined,
      })),
    );
    return c.json({ items, total, limit, offset });
  });

  // B5. 공개 지도 통계(0018) — 시도별 상태 버킷 카운트. 카운트만(본문·식별정보 0).
  // sido null 은 미지정 버킷(별도 항목). ?domain= 으로 도메인 필터(election|assembly).
  // 미지(허용 외) domain 은 빈 결과가 아니라 필터 미적용이면 혼동 → 그대로 통과시켜
  // 해당 도메인 0건이면 빈 집계가 되도록 둔다(단순). 좌표는 서버가 주지 않음(web 정적 매핑).
  app.get("/map-stats", async (c) => {
    const domain = c.req.query("domain") || undefined;
    const items = await mapStats(db, { domain });
    return c.json({ items });
  });

  // B3. 공개 선거 목록 — 아카이브 필터 드롭다운 옵션(0007).
  app.get("/elections", async (c) => {
    const items = await listElections(db);
    return c.json({ items });
  });

  // B2. 공개 상세 — verified=true 만, 아니면 404(존재 누설 금지)
  app.get("/reports/:id", async (c) => {
    const id = c.req.param("id");
    // 0018: 조회수는 verified-gated 원자 UPDATE. undefined(미검증·없음)면 404 — 미증가.
    // 이 단일 UPDATE 가 verified 게이트도 겸하므로 404 경로는 viewCount 증가 0.
    const viewCount = await incrementViewCount(db, id);
    if (viewCount === undefined) return c.json({ error: "not_found" }, 404);

    const graph = await getVerifiedReport(db, id);
    if (!graph) return c.json({ error: "not_found" }, 404);
    const v = graph.verification;
    return c.json({
      ...publicReport(graph.report),
      viewCount,
      // 0007: report.election_id 직접 링크의 선거 요약(id+name), 없으면 null.
      election: graph.election,
      // verification 요약(공개 안전 필드만). reviewer 신원·confidence·내부 감사필드 제외.
      // DB severity/legalIssue 는 text → 그대로(string) 내보냄(억지 변환 금지).
      verification: v
        ? {
            verified: v.verified,
            validity: v.validity,
            severity: v.severity,
            method: v.method,
            notes: v.notes,
            unverifiedClaims: v.unverifiedClaims,
          }
        : null,
      attachments: graph.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mime: a.mime,
        size: a.size,
        sha256: a.sha256,
      })),
      sources: graph.sources.map((s) => ({
        id: s.id,
        kind: s.kind,
        url: s.url,
        capturedAt: s.capturedAt,
        contentHash: s.contentHash,
        archiveUrl: s.archiveUrl,
      })),
    });
  });

  return app;
}
