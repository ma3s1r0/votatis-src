import { Hono } from "hono";
import type { Db } from "./db/repository.js";
import type { AuthEnv } from "./auth-routes.js";
import { loadSession, requireReviewer } from "./auth-routes.js";
import {
  submitVerification,
  listPendingReports,
  getReportForReview,
  type EvidenceLink,
} from "./db/verification.js";

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
    occurredAt: r.occurredAt,
    collectedAt: r.collectedAt,
    verified: r.vVerified ?? false,
  };
}

export function createAdminApp(opts: { db: Db }) {
  const { db } = opts;
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
    const rows = await listPendingReports(db, { limit, offset });
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
    });
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
        evidenceLinks,
      },
    });

    if (!result.ok) {
      if ("reason" in result) return c.json({ error: "not_found" }, 404);
      return c.json({ error: "validation_error", fields: result.errors }, 422);
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
      },
      201,
    );
  });

  return app;
}
