import { describe, it, expect, beforeEach } from "vitest";
import { makeTestDb } from "./test-db.js";
import type { Db } from "./repository.js";
import {
  createElection,
  createEvent,
  createReport,
  createAttachment,
  createSource,
  updateReport,
  getReportHistory,
  getReportGraph,
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
    sido: "서울특별시",
    sigungu: "강남구",
    title: "제보 1",
    body: "본문",
  });
  return { elec, ev, rep };
}

describe("report 무결성", () => {
  // 수용 기준: collected_at 은 생성 시 자동 기록된다.
  it("collected_at 을 생성 시 자동 기록한다", async () => {
    const before = Date.now();
    const rep = await createReport(db, { title: "수집시점 테스트" });
    const after = Date.now();
    expect(rep.collectedAt).toBeInstanceOf(Date);
    const t = rep.collectedAt.getTime();
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(after + 1000);
  });

  // 수용 기준: verification 필드가 모델에 존재한다(nullable).
  it("verification 필드를 nullable 로 예약한다", async () => {
    const rep = await createReport(db, { title: "검증필드" });
    expect(rep.vConfidence).toBeNull();
    expect(rep.vValidity).toBeNull();
    expect(rep.vSeverity).toBeNull();
    expect(rep.vLegalIssue).toBeNull();
    expect(rep.vVerified).toBeNull();
  });
});

describe("source 무결성", () => {
  // 수용 기준: source 는 captured_at + content_hash 필수.
  it("captured_at 없으면 거부", async () => {
    const { rep } = await seedReport();
    await expect(
      createSource(db, {
        reportId: rep.id,
        kind: "url",
        url: "https://example.com",
        // captured_at 누락
        capturedAt: undefined as unknown as Date,
        contentHash: "abc123",
      }),
    ).rejects.toThrow(/captured_at/);
  });

  it("content_hash 없으면 거부", async () => {
    const { rep } = await seedReport();
    await expect(
      createSource(db, {
        reportId: rep.id,
        kind: "url",
        url: "https://example.com",
        capturedAt: new Date(),
        contentHash: undefined as unknown as string,
      }),
    ).rejects.toThrow(/content_hash/);
  });

  it("captured_at + content_hash 있으면 archive_url 과 함께 생성", async () => {
    const { rep } = await seedReport();
    const src = await createSource(db, {
      reportId: rep.id,
      kind: "url",
      url: "https://nec.go.kr/x",
      capturedAt: new Date(),
      contentHash: "deadbeef",
      archiveUrl: "https://web.archive.org/x",
      snapshotRef: "s3://snap/1",
    });
    expect(src.contentHash).toBe("deadbeef");
    expect(src.archiveUrl).toBe("https://web.archive.org/x");
  });
});

describe("report 버전 보존 (파괴적 업데이트 금지)", () => {
  // 수용 기준: 수정 시 이전 버전이 이력으로 보존·조회된다.
  it("수정 시 직전 상태가 report_history 에 남는다", async () => {
    const { rep } = await seedReport();
    expect(rep.version).toBe(1);

    const updated = await updateReport(db, rep.id, { title: "수정된 제목" });
    expect(updated.title).toBe("수정된 제목");
    expect(updated.version).toBe(2);

    const history = await getReportHistory(db, rep.id);
    expect(history).toHaveLength(1);
    expect(history[0].version).toBe(1);
    // 직전 상태(원래 제목)가 스냅샷에 보존
    expect((history[0].snapshot as { title: string }).title).toBe("제보 1");
  });

  it("여러 번 수정해도 모든 이전 버전이 누적된다", async () => {
    const { rep } = await seedReport();
    await updateReport(db, rep.id, { title: "v2" });
    await updateReport(db, rep.id, { title: "v3" });
    const history = await getReportHistory(db, rep.id);
    expect(history.map((h) => h.version)).toEqual([1, 2]);
    expect((history[0].snapshot as { title: string }).title).toBe("제보 1");
    expect((history[1].snapshot as { title: string }).title).toBe("v2");
  });
});

describe("관계 조회", () => {
  // 수용 기준: election–event–report–attachment–source 관계 조회 동작.
  it("report 그래프로 사건·선거·첨부·출처를 조회한다", async () => {
    const { elec, ev, rep } = await seedReport();
    await createAttachment(db, {
      reportId: rep.id,
      storageKey: "s3://k/1",
      sha256: "hash1",
      mime: "image/jpeg",
    });
    await createSource(db, {
      reportId: rep.id,
      kind: "text",
      capturedAt: new Date(),
      contentHash: "h",
    });

    const graph = await getReportGraph(db, rep.id);
    expect(graph).toBeDefined();
    expect(graph!.report.id).toBe(rep.id);
    expect(graph!.event!.id).toBe(ev.id);
    expect(graph!.election!.id).toBe(elec.id);
    expect(graph!.attachments).toHaveLength(1);
    expect(graph!.sources).toHaveLength(1);
  });
});
