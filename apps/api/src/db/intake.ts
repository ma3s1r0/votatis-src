import { createHash } from "node:crypto";
import { and, eq, gt, desc, sql } from "drizzle-orm";
import type { Db } from "./repository.js";
import { report, attachment, source, intakeAttempt, verification } from "./schema.js";

// rate limit 설정 (0001 패턴, IP 키 윈도 카운팅).
const RATE_WINDOW_MS = 60 * 1000; // 1분
const RATE_MAX = 5; // 윈도당 5건

// submitter 익명화: IP 등 식별정보는 솔트 해시로만 저장(원문 저장 금지).
export function hashSubmitter(raw: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${raw}`).digest("hex");
}

// 제보 수집 rate limit: 윈도 내 동일 키 건수가 임계 이상이면 true(차단).
export async function isIntakeRateLimited(db: Db, key: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const rows = await db
    .select()
    .from(intakeAttempt)
    .where(and(eq(intakeAttempt.key, key), gt(intakeAttempt.attemptedAt, since)));
  return rows.length >= RATE_MAX;
}

export async function recordIntakeAttempt(db: Db, key: string): Promise<void> {
  await db.insert(intakeAttempt).values({ key });
}

// report 존재 여부(첨부 create 의 FK 위반 500 방지 → 404 분기용).
export async function reportExists(db: Db, reportId: string): Promise<boolean> {
  const rows = await db.select({ id: report.id }).from(report).where(eq(report.id, reportId));
  return rows.length > 0;
}

// 첨부 create: pending 행 생성(sha256 미정, expected_sha256·storage_key 기록).
export async function createPendingAttachment(
  db: Db,
  input: {
    reportId: string;
    storageKey: string;
    filename?: string;
    mime: string;
    size: number;
    expectedSha256?: string;
  },
): Promise<typeof attachment.$inferSelect> {
  const [row] = await db
    .insert(attachment)
    .values({
      reportId: input.reportId,
      storageKey: input.storageKey,
      filename: input.filename,
      mime: input.mime,
      size: input.size,
      expectedSha256: input.expectedSha256,
      status: "pending",
    })
    .returning();
  return row;
}

export type FinalizeOutcome =
  | { ok: true; attachment: typeof attachment.$inferSelect }
  | { ok: false; reason: "not_found" | "already_stored" | "object_missing" | "mismatch" };

// 첨부 finalize: S3 객체 존재·크기 확인 후 sha256 확정 + status=stored.
// 객체 없음/크기·해시 불일치는 거부(무결성).
export async function finalizeAttachment(
  db: Db,
  args: {
    reportId: string;
    attachmentId: string;
    headObject: (key: string) => Promise<
      { exists: false } | { exists: true; size: number; sha256: string }
    >;
  },
): Promise<FinalizeOutcome> {
  const [row] = await db
    .select()
    .from(attachment)
    .where(
      and(eq(attachment.id, args.attachmentId), eq(attachment.reportId, args.reportId)),
    );
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "stored") return { ok: false, reason: "already_stored" };

  const head = await args.headObject(row.storageKey);
  if (!head.exists) return { ok: false, reason: "object_missing" };

  // 무결성: create 시 신고한 크기와 실제 객체 크기가 일치해야 한다.
  if (row.size != null && head.size !== row.size) {
    return { ok: false, reason: "mismatch" };
  }
  // expected_sha256 을 주장했다면 실제 객체 해시와 일치해야 한다.
  if (row.expectedSha256 && row.expectedSha256 !== head.sha256) {
    return { ok: false, reason: "mismatch" };
  }

  const [updated] = await db
    .update(attachment)
    .set({ sha256: head.sha256, size: head.size, status: "stored" })
    .where(eq(attachment.id, row.id))
    .returning();
  return { ok: true, attachment: updated };
}

export type ListParams = {
  limit: number;
  offset: number;
  q?: string;
  sido?: string;
};

// 공개 목록: verified=true 인 report 만. q(제목/본문 부분일치)·sido 필터·페이지네이션.
export async function listVerifiedReports(db: Db, params: ListParams) {
  const conds = [eq(report.vVerified, true)];
  if (params.sido) conds.push(eq(report.sido, params.sido));
  if (params.q) {
    const like = `%${params.q}%`;
    conds.push(sql`(${report.title} ILIKE ${like} OR ${report.body} ILIKE ${like})`);
  }
  const where = and(...conds);

  const rows = await db
    .select()
    .from(report)
    .where(where)
    .orderBy(desc(report.collectedAt))
    .limit(params.limit)
    .offset(params.offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(report)
    .where(where);

  return { rows, total: count };
}

// 공개 상세: verified=true 인 report 만. 미검증/없음은 undefined(라우트에서 404).
export async function getVerifiedReport(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(report)
    .where(and(eq(report.id, id), eq(report.vVerified, true)));
  if (!row) return undefined;

  const attachments = await db
    .select()
    .from(attachment)
    .where(and(eq(attachment.reportId, id), eq(attachment.status, "stored")));
  const sources = await db.select().from(source).where(eq(source.reportId, id));
  // 활성 판정(report 당 1행). 공개 직렬화의 verification 요약 근거.
  const [activeVerification] = await db
    .select()
    .from(verification)
    .where(eq(verification.reportId, id));
  return { report: row, attachments, sources, verification: activeVerification };
}
