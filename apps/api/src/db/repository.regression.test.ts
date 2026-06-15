import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "./test-db.js";
import type { Db } from "./repository.js";
import { source, reportHistory } from "./schema.js";
import {
  createElection,
  createEvent,
  createReport,
  updateReport,
  getReportHistory,
} from "./repository.js";

let db: Db;

beforeEach(async () => {
  db = await makeTestDb();
});

async function seedReport() {
  const elec = await createElection(db, { name: "제8회 지방선거", type: "지선" });
  const ev = await createEvent(db, {
    electionId: elec.id,
    sido: "서울특별시",
    sigungu: "강남구",
    title: "투표소 사건",
  });
  const rep = await createReport(db, {
    eventId: ev.id,
    title: "제보 1",
    body: "본문",
  });
  return { elec, ev, rep };
}

// 앱 레벨 검증(createSource)을 우회해 직접 insert 했을 때 DB 가 막는지.
// 무결성이 코드 한 곳에만 의존하지 않고 스키마 제약으로도 강제되는지 확인.
describe("source DB 제약 (앱 검증 우회 방어)", () => {
  it("captured_at 없이 raw insert 하면 DB(NOT NULL) 가 거부한다", async () => {
    const { rep } = await seedReport();
    await expect(
      db.insert(source).values({
        reportId: rep.id,
        kind: "url",
        url: "https://example.com",
        contentHash: "abc",
        // capturedAt 누락 → DB NOT NULL 위반 기대
      } as never),
    ).rejects.toThrow();
  });

  it("content_hash 없이 raw insert 하면 DB(NOT NULL) 가 거부한다", async () => {
    const { rep } = await seedReport();
    await expect(
      db.insert(source).values({
        reportId: rep.id,
        kind: "url",
        url: "https://example.com",
        capturedAt: new Date(),
        // contentHash 누락 → DB NOT NULL 위반 기대
      } as never),
    ).rejects.toThrow();
  });
});

describe("updateReport 트랜잭션 원자성·예외", () => {
  it("존재하지 않는 report 수정은 거부되고 이력이 남지 않는다", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await expect(updateReport(db, fakeId, { title: "x" })).rejects.toThrow(
      /not found/,
    );
    const orphanHistory = await db
      .select()
      .from(reportHistory)
      .where(eq(reportHistory.reportId, fakeId));
    expect(orphanHistory).toHaveLength(0);
  });

  it("수정이 실패하면 history append 도 롤백된다(원자성)", async () => {
    const { rep } = await seedReport();
    // title 은 NOT NULL. null 로 세팅 시 update 단계에서 DB 위반 → 트랜잭션 전체 롤백 기대.
    await expect(
      updateReport(db, rep.id, { title: null as never }),
    ).rejects.toThrow();

    // 트랜잭션이 원자적이라면 직전 상태 스냅샷이 history 에 남으면 안 된다.
    const history = await getReportHistory(db, rep.id);
    expect(history).toHaveLength(0);

    // 원본 report 도 version 1, 원래 제목 그대로 유지.
    const { getReportGraph } = await import("./repository.js");
    const graph = await getReportGraph(db, rep.id);
    expect(graph!.report.version).toBe(1);
    expect(graph!.report.title).toBe("제보 1");
  });
});
