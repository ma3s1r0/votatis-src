import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "./repository.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "drizzle");

// pglite 인메모리 DB 생성 후 drizzle-kit 마이그레이션 SQL 을 적용.
// 테스트(makeTestDb)와 로컬 dev 서버(dev-server.ts)가 공유하는 공용 헬퍼.
export async function makeMigratedDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    // drizzle-kit 은 statement 를 `--> statement-breakpoint` 로 구분.
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }

  return db as Db;
}

// 기존 테스트 호환 별칭.
export async function makeTestDb(): Promise<Db> {
  return makeMigratedDb();
}
