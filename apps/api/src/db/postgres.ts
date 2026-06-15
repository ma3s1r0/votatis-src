import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Db } from "./repository.js";

// 운영용 DB 팩토리(node-postgres). 실 연결은 호출 시점에 일어난다.
// 마이그레이션은 배포 단계에서 drizzle-kit 으로 별도 실행(앱 기동이 자동 마이그레이션하지 않음).
//
// 반환 타입은 공용 Db(PgDatabase) 와 호환 — repository/auth/intake 계층이 그대로 사용.
// 비밀(connectionString)은 로그에 남기지 않는다.
export function createPostgresDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 5 });
  return drizzle(pool) as Db;
}
