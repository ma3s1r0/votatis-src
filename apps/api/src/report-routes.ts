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
} from "./db/intake.js";
import { isReportCategory } from "./categories.js";
import { currentStage, buildTimeline } from "./tracking.js";

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
  occurredAt: Date | null;
  collectedAt: Date;
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
    occurredAt: r.occurredAt,
    collectedAt: r.collectedAt,
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
  consent?: boolean;
  license?: string;
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

    // 0007: category 는 고정 enum 집합에 속할 때만(허용 외 → 400).
    if (body.category != null && !isReportCategory(body.category)) {
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
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      category: body.category,
      electionId: body.electionId,
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
    const storageKey = `${bucketPrefix}/${reportId}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;

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

    const presigned = await storage.presignGet({
      key: row.storageKey,
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

    const { rows, total } = await listVerifiedReports(db, {
      limit,
      offset,
      q,
      sido,
      category,
      electionId,
    });
    return c.json({
      items: rows.map(publicReport),
      total,
      limit,
      offset,
    });
  });

  // B3. 공개 선거 목록 — 아카이브 필터 드롭다운 옵션(0007).
  app.get("/elections", async (c) => {
    const items = await listElections(db);
    return c.json({ items });
  });

  // B2. 공개 상세 — verified=true 만, 아니면 404(존재 누설 금지)
  app.get("/reports/:id", async (c) => {
    const graph = await getVerifiedReport(db, c.req.param("id"));
    if (!graph) return c.json({ error: "not_found" }, 404);
    const v = graph.verification;
    return c.json({
      ...publicReport(graph.report),
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
