import { Hono } from "hono";
import type { Db } from "./db/repository.js";
import type { StoragePort } from "./storage.js";
import type { AuthEnv } from "./auth-routes.js";
import { loadSession, requireReviewer } from "./auth-routes.js";
import {
  submitVerification,
  listPendingReports,
  getReportForReview,
  REQUIRED_APPROVALS,
  type EvidenceLink,
} from "./db/verification.js";
import { getStoredAttachmentForReview } from "./db/intake.js";
import type { MosaicPort } from "./mosaic.js";
import { processMosaicForReport } from "./db/mosaic.js";

// presigned GET 만료(0008 결정 2: 5분, 공개 다운로드와 동일 보수값).
const DOWNLOAD_TTL_SECONDS = 5 * 60;

// 관리자 검토 콘솔 API(0004). 모든 라우트는 requireReviewer 로 보호된다.
// 미인증 401 / 비active(disabled 포함) 403. db 는 0002 패턴으로 주입.

type EvidenceInput = {
  url?: string;
  capturedAt?: string;
  contentHash?: string;
  archiveUrl?: string;
  snapshotRef?: string;
};

type VerificationBody = {
  confidence?: number | null;
  validity?: string | null;
  severity?: string | null;
  legalIssue?: string | null;
  verified?: boolean;
  method?: string | null;
  notes?: string | null;
  unverifiedClaims?: string | null;
  evidenceLinks?: EvidenceInput[];
};

// 관리자 직렬화: 공개 직렬화와 분리. verification 내부 필드 포함(검토용).
function adminReport(r: {
  id: string;
  title: string;
  body: string | null;
  status: string;
  sido: string | null;
  sigungu: string | null;
  eupMyeonDong: string | null;
  domain: string;
  occurredAt: Date | null;
  collectedAt: Date;
  vVerified: boolean | null;
}) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    status: r.status,
    sido: r.sido,
    sigungu: r.sigungu,
    eupMyeonDong: r.eupMyeonDong,
    domain: r.domain,
    occurredAt: r.occurredAt,
    collectedAt: r.collectedAt,
    verified: r.vVerified ?? false,
  };
}

export function createAdminApp(opts: { db: Db; storage: StoragePort; mosaic: MosaicPort }) {
  const { db, storage, mosaic } = opts;
  const app = new Hono<AuthEnv>();

  // db 주입 + 세션 로드 → 모든 라우트 reviewer 보호.
  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });
  app.use("*", loadSession);
  app.use("*", requireReviewer);

  // 검토 큐: 미검증 제보 목록(관리자 전용, 공개 0002 와 가시성 분리).
  app.get("/reports", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 100);
    const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);
    const domain = c.req.query("domain") || undefined;
    const rows = await listPendingReports(db, { limit, offset, domain });
    return c.json({ items: rows.map(adminReport), limit, offset });
  });

  // 검토 상세: verified 무관 전체 + 첨부·출처·현재 판정·판정 이력.
  app.get("/reports/:id", async (c) => {
    const graph = await getReportForReview(db, c.req.param("id"));
    if (!graph) return c.json({ error: "not_found" }, 404);
    return c.json({
      ...adminReport(graph.report),
      attachments: graph.attachments.map((a) => ({
        id: a.id,
        mime: a.mime,
        size: a.size,
        sha256: a.sha256,
        status: a.status,
      })),
      sources: graph.sources.map((s) => ({
        id: s.id,
        kind: s.kind,
        url: s.url,
        capturedAt: s.capturedAt,
        contentHash: s.contentHash,
        archiveUrl: s.archiveUrl,
      })),
      verification: graph.verification
        ? {
            confidence: graph.verification.confidence,
            validity: graph.verification.validity,
            severity: graph.verification.severity,
            legalIssue: graph.verification.legalIssue,
            verified: graph.verification.verified,
            method: graph.verification.method,
            notes: graph.verification.notes,
            unverifiedClaims: graph.verification.unverifiedClaims,
            reviewerId: graph.verification.reviewerId,
            reviewedAt: graph.verification.reviewedAt,
            version: graph.verification.version,
            evidence: graph.evidence.map((e) => ({
              id: e.id,
              url: e.url,
              capturedAt: e.capturedAt,
              contentHash: e.contentHash,
            })),
          }
        : null,
      verificationHistory: graph.history.map((h) => ({
        version: h.version,
        archivedAt: h.archivedAt,
        snapshot: h.snapshot,
      })),
      // 0017 교차검증 진행도. UI 가 "N/2" 와 동의자(내부 reviewerId)를 렌더.
      crossVerification: {
        approvals: graph.approvals.length,
        required: REQUIRED_APPROVALS,
        approvers: graph.approvals.map((a) => a.reviewerId),
      },
    });
  });

  // 관리 첨부 다운로드 — verified 무관, stored ∧ 소속 일치면 presigned GET URL(0008).
  // requireReviewer(미인증 401 / 비active 403)는 위 use 미들웨어가 강제. 미충족 첨부는 404.
  app.get("/reports/:id/attachments/:attachmentId/download", async (c) => {
    const row = await getStoredAttachmentForReview(db, {
      reportId: c.req.param("id"),
      attachmentId: c.req.param("attachmentId"),
    });
    if (!row) return c.json({ error: "not_found" }, 404);

    const presigned = await storage.presignGet({
      key: row.storageKey,
      expiresInSeconds: DOWNLOAD_TTL_SECONDS,
    });
    return c.json({ url: presigned.url, expiresInSeconds: presigned.expiresInSeconds });
  });

  // 판정 작성·수정. 근거 강제는 서버 권위(method + evidence≥1). 위반 시 422.
  app.post("/reports/:id/verification", async (c) => {
    const reportId = c.req.param("id");
    const user = c.get("user");

    let body: VerificationBody;
    try {
      body = await c.req.json<VerificationBody>();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    // evidence source 무결성: url + captured_at + content_hash 필수(0001).
    // 누락된 항목은 유효 근거로 치지 않음(빈 배열 → 근거 없음으로 422).
    const evidenceLinks: EvidenceLink[] = [];
    for (const e of body.evidenceLinks ?? []) {
      if (!e.url || !e.capturedAt || !e.contentHash) continue;
      evidenceLinks.push({
        url: e.url,
        capturedAt: new Date(e.capturedAt),
        contentHash: e.contentHash,
        archiveUrl: e.archiveUrl,
        snapshotRef: e.snapshotRef,
      });
    }

    const result = await submitVerification(db, {
      reportId,
      reviewerId: user.id,
      input: {
        confidence: body.confidence ?? null,
        validity: body.validity ?? null,
        severity: body.severity ?? null,
        legalIssue: body.legalIssue ?? null,
        verified: body.verified === true,
        method: body.method ?? null,
        notes: body.notes ?? null,
        unverifiedClaims: body.unverifiedClaims ?? null,
        evidenceLinks,
      },
    });

    if (!result.ok) {
      if ("reason" in result) {
        // 0017: 동일 reviewer 의 중복 동의는 409(진행도 불변).
        if (result.reason === "already_approved") {
          return c.json({ error: "already_approved" }, 409);
        }
        return c.json({ error: "not_found" }, 404);
      }
      return c.json({ error: "validation_error", fields: result.errors }, 422);
    }

    // 0016 공표 처리: verified=true(공표) 확정 시 assembly 첨부의 공개본(모자이크) 생성.
    // election 은 no-op(processMosaicForReport 내부 domain 분기). 멱등(이미 처리분 skip).
    if (result.verification.verified) {
      await processMosaicForReport(db, { reportId, mosaic, storage });
    }

    const v = result.verification;
    return c.json(
      {
        id: v.id,
        reportId: v.reportId,
        confidence: v.confidence,
        validity: v.validity,
        severity: v.severity,
        legalIssue: v.legalIssue,
        verified: v.verified,
        method: v.method,
        reviewerId: v.reviewerId,
        reviewedAt: v.reviewedAt,
        version: v.version,
        // 0017 교차검증 진행도(N/2). verified 는 2/2 충족 시에만 true.
        approvals: result.approvals,
        required: result.required,
      },
      201,
    );
  });

  return app;
}
