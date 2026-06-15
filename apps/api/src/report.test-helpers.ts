import { eq } from "drizzle-orm";
import { makeTestDb } from "./db/test-db.js";
import { createReportApp } from "./report-routes.js";
import { InMemoryStorage } from "./storage.js";
import { createElection } from "./db/repository.js";
import { report } from "./db/schema.js";
import type { Db } from "./db/repository.js";

export async function setup() {
  const db = await makeTestDb();
  const storage = new InMemoryStorage();
  const app = createReportApp({ db, storage, submitterSalt: "test-salt" });
  return { db, storage, app };
}

export function jsonReq(body: unknown, ip = "10.0.0.1"): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  };
}

// 테스트에서 0004(검증) 없이 공개 노출을 만들기 위해 verified 플래그를 직접 세팅.
export async function markVerified(db: Db, reportId: string, verified = true) {
  await db.update(report).set({ vVerified: verified }).where(eq(report.id, reportId));
}

// 테스트용 election seed(0007 필터 옵션·electionId 연결 검증).
export async function seedElection(db: Db, name = "제8회 전국동시지방선거", type = "지선") {
  return createElection(db, { name, type });
}

export type { Db };
