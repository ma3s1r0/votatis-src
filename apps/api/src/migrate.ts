// 배포용 마이그레이션 + 첫 관리자 부트스트랩 엔트리.
//
// 비공개 RDS(프라이빗 서브넷)는 VPC 밖에서 닿지 않으므로, 이 핸들러를 VPC 내
// Lambda 로 배포해 1회 호출한다(드리즐 저널 기반 — 멱등 재실행 안전). 앱(lambda.ts)은
// 자동 마이그레이션하지 않는다(기동-마이그레이션 레이스 회피).
//
// env:
//  - DATABASE_URL            (필수)
//  - MIGRATIONS_DIR          (선택, 기본 "drizzle" — Lambda 태스크 루트 기준)
//  - BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD       (선택) 루트 관리자 시드
//  - BOOTSTRAP_REVIEWER2_EMAIL / BOOTSTRAP_REVIEWER2_PASSWORD (선택) 2번째 검증자
//    (0017 2인 교차검증 테스트용 — 서로 다른 reviewer 2인 필요)

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPostgresDb } from "./db/postgres.js";
import { seedRoot } from "./db/auth.js";

export type MigrateResult = {
  migrated: true;
  admins: string[];
};

export async function runMigrate(
  env: NodeJS.ProcessEnv = process.env,
): Promise<MigrateResult> {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing required env: DATABASE_URL");

  const migrationsFolder = path.resolve(env.MIGRATIONS_DIR ?? "drizzle");
  const db = createPostgresDb(databaseUrl);

  await migrate(db as unknown as NodePgDatabase, { migrationsFolder });

  // 멱등 부트스트랩(이미 있으면 그대로 둠). 자격증명은 배포 측 시크릿이 출처.
  const admins: string[] = [];
  if (env.BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_ADMIN_PASSWORD) {
    await seedRoot(db, env.BOOTSTRAP_ADMIN_EMAIL, env.BOOTSTRAP_ADMIN_PASSWORD);
    admins.push(env.BOOTSTRAP_ADMIN_EMAIL);
  }
  if (env.BOOTSTRAP_REVIEWER2_EMAIL && env.BOOTSTRAP_REVIEWER2_PASSWORD) {
    await seedRoot(
      db,
      env.BOOTSTRAP_REVIEWER2_EMAIL,
      env.BOOTSTRAP_REVIEWER2_PASSWORD,
    );
    admins.push(env.BOOTSTRAP_REVIEWER2_EMAIL);
  }

  return { migrated: true, admins };
}

// Lambda 핸들러(이벤트 무시 — 호출 자체가 트리거).
export async function handler(): Promise<MigrateResult> {
  const result = await runMigrate();
  // 비밀은 로그에 남기지 않는다 — 이메일/건수만.
  console.log(
    `migrate ok; bootstrapped admins: ${result.admins.join(", ") || "(none)"}`,
  );
  return result;
}
