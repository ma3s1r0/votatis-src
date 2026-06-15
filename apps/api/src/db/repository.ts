import { eq, asc } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  election,
  event,
  report,
  reportHistory,
  attachment,
  source,
} from "./schema.js";

// 운영(node-postgres)·테스트(pglite) 양쪽 드라이버가 공유하는 공용 Postgres DB 타입.
// 두 드라이버 모두 PgDatabase<QueryResultHKT, ...> 를 상속하므로, 쿼리 결과 HKT 를
// 베이스로 두면 repository/auth/intake 계층이 드라이버에 결합되지 않는다.
export type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

type ElectionInsert = typeof election.$inferInsert;
type EventInsert = typeof event.$inferInsert;
type AttachmentInsert = typeof attachment.$inferInsert;

// report 생성 입력. collected_at 은 미지정 시 자동 기록.
type ReportInsert = typeof report.$inferInsert;
type ReportCreate = Omit<ReportInsert, "collectedAt" | "version" | "updatedAt"> & {
  collectedAt?: Date;
};

// source 생성 입력. captured_at + content_hash 없이는 거부.
type SourceInsert = typeof source.$inferInsert;

export async function createElection(db: Db, input: ElectionInsert) {
  const [row] = await db.insert(election).values(input).returning();
  return row;
}

export async function createEvent(db: Db, input: EventInsert) {
  const [row] = await db.insert(event).values(input).returning();
  return row;
}

export async function createReport(db: Db, input: ReportCreate) {
  // 무결성: 수집 시점은 생성 시 항상 기록된다.
  const collectedAt = input.collectedAt ?? new Date();
  const [row] = await db
    .insert(report)
    .values({ ...input, collectedAt })
    .returning();
  return row;
}

export async function createAttachment(db: Db, input: AttachmentInsert) {
  const [row] = await db.insert(attachment).values(input).returning();
  return row;
}

export async function createSource(db: Db, input: SourceInsert) {
  // 무결성: 외부 원본은 바뀐다 → captured_at + content_hash 없으면 거부.
  if (!input.capturedAt) {
    throw new Error("source requires captured_at");
  }
  if (!input.contentHash) {
    throw new Error("source requires content_hash");
  }
  const [row] = await db.insert(source).values(input).returning();
  return row;
}

// report 수정. 파괴적 업데이트 금지 — 직전 상태를 report_history 에 append 후 갱신.
export async function updateReport(
  db: Db,
  id: string,
  patch: Partial<Omit<ReportInsert, "id" | "version" | "collectedAt">>,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(report).where(eq(report.id, id));
    if (!current) {
      throw new Error(`report not found: ${id}`);
    }
    // 직전 상태 보존
    await tx.insert(reportHistory).values({
      reportId: current.id,
      version: current.version,
      snapshot: current,
    });
    const [updated] = await tx
      .update(report)
      .set({ ...patch, version: current.version + 1, updatedAt: new Date() })
      .where(eq(report.id, id))
      .returning();
    return updated;
  });
}

// 이전 버전 이력 조회 (오래된 순).
export async function getReportHistory(db: Db, reportId: string) {
  return db
    .select()
    .from(reportHistory)
    .where(eq(reportHistory.reportId, reportId))
    .orderBy(asc(reportHistory.version));
}

// election–event–report–attachment–source 관계 조회.
export async function getReportGraph(db: Db, reportId: string) {
  const [rep] = await db.select().from(report).where(eq(report.id, reportId));
  if (!rep) return undefined;

  const attachments = await db
    .select()
    .from(attachment)
    .where(eq(attachment.reportId, reportId));
  const sources = await db
    .select()
    .from(source)
    .where(eq(source.reportId, reportId));

  let ev: typeof event.$inferSelect | undefined;
  let elec: typeof election.$inferSelect | undefined;
  if (rep.eventId) {
    [ev] = await db.select().from(event).where(eq(event.id, rep.eventId));
    if (ev?.electionId) {
      [elec] = await db
        .select()
        .from(election)
        .where(eq(election.id, ev.electionId));
    }
  }

  return { report: rep, event: ev, election: elec, attachments, sources };
}
