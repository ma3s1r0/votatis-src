import { Hono } from "hono";
import type { Db } from "./db/repository.js";
import type { StoragePort } from "./storage.js";
import { createReport, createSource } from "./db/repository.js";
import {
  hashSubmitter,
  isIntakeRateLimited,
  recordIntakeAttempt,
  reportExists,
  createPendingAttachment,
  finalizeAttachment,
  listVerifiedReports,
  getVerifiedReport,
} from "./db/intake.js";

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

    return c.json({ id: created.id, status: created.status }, 201);
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

  // B1. 공개 목록 — verified=true 만
  app.get("/reports", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
    const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
    const q = c.req.query("q") || undefined;
    const sido = c.req.query("sido") || undefined;

    const { rows, total } = await listVerifiedReports(db, { limit, offset, q, sido });
    return c.json({
      items: rows.map(publicReport),
      total,
      limit,
      offset,
    });
  });

  // B2. 공개 상세 — verified=true 만, 아니면 404(존재 누설 금지)
  app.get("/reports/:id", async (c) => {
    const graph = await getVerifiedReport(db, c.req.param("id"));
    if (!graph) return c.json({ error: "not_found" }, 404);
    return c.json({
      ...publicReport(graph.report),
      attachments: graph.attachments.map((a) => ({
        id: a.id,
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
