import { and, desc, eq, isNull, asc } from "drizzle-orm";
import type { Db } from "./repository.js";
import {
  report,
  attachment,
  source,
  verification,
  verificationHistory,
} from "./schema.js";

// 허용값(결정 6, 스펙 64행 기본안). 서버 권위 — 클라이언트 검증과 독립적으로 재검증.
export const VALIDITY_VALUES = ["valid", "partly", "invalid", "unclear"] as const;
export type Validity = (typeof VALIDITY_VALUES)[number];
export const SEVERITY_VALUES = ["1", "2", "3", "4", "5"] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];

// 판정 입력. evidenceLinks 는 근거 source(url) — 최소 1개 강제(결정 1).
export type EvidenceLink = {
  url: string;
  capturedAt: Date;
  contentHash: string;
  archiveUrl?: string;
  snapshotRef?: string;
};

export type VerificationInput = {
  confidence?: number | null;
  validity?: string | null;
  severity?: string | null;
  legalIssue?: string | null;
  verified: boolean;
  method?: string | null;
  notes?: string | null;
  evidenceLinks: EvidenceLink[];
};

// 검증 실패 사유. 라우트가 422 로 매핑.
export type VerificationError =
  | { field: "method"; reason: "required" }
  | { field: "evidence_links"; reason: "required" }
  | { field: "confidence"; reason: "out_of_range" }
  | { field: "validity"; reason: "out_of_range" }
  | { field: "severity"; reason: "out_of_range" };

// 근거·범위 검증(서버 권위). 통과 못 하면 에러 목록 반환, 레코드 미생성.
export function validateVerification(input: VerificationInput): VerificationError[] {
  const errors: VerificationError[] = [];

  // 근거 강제(결정 1): method + evidence(≥1).
  if (!input.method || input.method.trim() === "") {
    errors.push({ field: "method", reason: "required" });
  }
  if (!input.evidenceLinks || input.evidenceLinks.length < 1) {
    errors.push({ field: "evidence_links", reason: "required" });
  }

  // 범위(결정 6). 값이 주어졌을 때만 검증(필드는 nullable 예약).
  if (
    input.confidence != null &&
    (typeof input.confidence !== "number" ||
      Number.isNaN(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 100)
  ) {
    errors.push({ field: "confidence", reason: "out_of_range" });
  }
  if (input.validity != null && !VALIDITY_VALUES.includes(input.validity as Validity)) {
    errors.push({ field: "validity", reason: "out_of_range" });
  }
  if (input.severity != null && !SEVERITY_VALUES.includes(input.severity as Severity)) {
    errors.push({ field: "severity", reason: "out_of_range" });
  }

  return errors;
}

export type SubmitResult =
  | { ok: true; verification: typeof verification.$inferSelect }
  | { ok: false; errors: VerificationError[] }
  | { ok: false; reason: "report_not_found" };

// 판정 제출(생성·수정 공용). 근거/범위 검증 → report 존재 확인 → 트랜잭션:
//  - 기존 판정 있으면 직전 상태를 verification_history 에 append 후 갱신(파괴 금지).
//  - evidence 는 source(kind=url, captured_at·content_hash) 로 무결성 보관, verification 연결.
//  - report.v_* 미러링 + verified 반영.
export async function submitVerification(
  db: Db,
  args: { reportId: string; reviewerId: string; input: VerificationInput },
): Promise<SubmitResult> {
  const errors = validateVerification(args.input);
  if (errors.length > 0) return { ok: false, errors };

  const [rep] = await db.select().from(report).where(eq(report.id, args.reportId));
  if (!rep) return { ok: false, reason: "report_not_found" };

  const input = args.input;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(verification)
      .where(eq(verification.reportId, args.reportId));

    let row: typeof verification.$inferSelect;
    if (existing) {
      // 직전 상태 보존(0001 패턴).
      await tx.insert(verificationHistory).values({
        verificationId: existing.id,
        reportId: existing.reportId,
        version: existing.version,
        snapshot: existing,
      });
      [row] = await tx
        .update(verification)
        .set({
          confidence: input.confidence ?? null,
          validity: input.validity ?? null,
          severity: input.severity ?? null,
          legalIssue: input.legalIssue ?? null,
          verified: input.verified,
          method: input.method!,
          notes: input.notes ?? null,
          reviewerId: args.reviewerId,
          reviewedAt: new Date(),
          version: existing.version + 1,
        })
        .where(eq(verification.id, existing.id))
        .returning();
    } else {
      [row] = await tx
        .insert(verification)
        .values({
          reportId: args.reportId,
          confidence: input.confidence ?? null,
          validity: input.validity ?? null,
          severity: input.severity ?? null,
          legalIssue: input.legalIssue ?? null,
          verified: input.verified,
          method: input.method!,
          notes: input.notes ?? null,
          reviewerId: args.reviewerId,
        })
        .returning();
    }

    // 근거 source 보관(무결성 스냅샷). 매 판정마다 새 evidence source append.
    for (const e of input.evidenceLinks) {
      await tx.insert(source).values({
        reportId: args.reportId,
        verificationId: row.id,
        kind: "url",
        url: e.url,
        capturedAt: e.capturedAt,
        contentHash: e.contentHash,
        archiveUrl: e.archiveUrl,
        snapshotRef: e.snapshotRef,
      });
    }

    // 0001 report.v_* 미러링(공개 조회 0002/0005 가 참조).
    await tx
      .update(report)
      .set({
        vConfidence: input.confidence ?? null,
        vValidity: input.validity ?? null,
        vSeverity: input.severity ?? null,
        vLegalIssue: input.legalIssue ?? null,
        vVerified: input.verified,
      })
      .where(eq(report.id, args.reportId));

    return { ok: true, verification: row };
  });
}

// 검토 큐: 미검증(verified != true) 제보. 관리자 전용 — 공개 0002 와 가시성 분리.
export async function listPendingReports(
  db: Db,
  params: { limit: number; offset: number },
) {
  const where = isNull(report.vVerified);
  const rows = await db
    .select()
    .from(report)
    .where(where)
    .orderBy(desc(report.collectedAt))
    .limit(params.limit)
    .offset(params.offset);
  return rows;
}

// 관리자 상세: verified 무관 전체 + 첨부·출처·현재 판정·판정 이력.
export async function getReportForReview(db: Db, reportId: string) {
  const [rep] = await db.select().from(report).where(eq(report.id, reportId));
  if (!rep) return undefined;

  const attachments = await db
    .select()
    .from(attachment)
    .where(eq(attachment.reportId, reportId));
  // 제보 출처(판정 근거가 아닌 원본 출처): verification_id 가 없는 source.
  const sources = await db
    .select()
    .from(source)
    .where(and(eq(source.reportId, reportId), isNull(source.verificationId)));

  const [current] = await db
    .select()
    .from(verification)
    .where(eq(verification.reportId, reportId));

  const evidence = current
    ? await db.select().from(source).where(eq(source.verificationId, current.id))
    : [];

  const history = current
    ? await db
        .select()
        .from(verificationHistory)
        .where(eq(verificationHistory.reportId, reportId))
        .orderBy(asc(verificationHistory.version))
    : [];

  return { report: rep, attachments, sources, verification: current, evidence, history };
}
