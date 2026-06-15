import { serve } from "@hono/node-server";
import { buildApp } from "./app.js";
import { makeMigratedDb } from "./db/test-db.js";
import { InMemoryStorage } from "./storage.js";
import { seed } from "./seed.js";

// 로컬 dev 서버. 실 RDS/S3 없이 전체 앱을 구동한다.
//  - DB: pglite 인메모리(마이그레이션 적용). 프로세스 종료 시 소멸.
//  - storage: InMemoryStorage 더블.
//  - 부팅 시 1회 결정적 시드.
// 운영(lambda.ts / createConfiguredApp)과 완전히 분리된 dev 전용 엔트리.

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

export async function startDevServer() {
  const db = await makeMigratedDb();
  const storage = new InMemoryStorage();
  const result = await seed(db, storage);

  const app = buildApp({
    db,
    storage,
    // 쿠키 세션(credentials:true) → 와일드카드 금지, 로컬 web 오리진 명시.
    corsOrigins: [WEB_ORIGIN],
    submitterSalt: "votatis-dev-salt",
    inviteBaseUrl: `${WEB_ORIGIN}/invite`,
  });

  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port });

  console.log("");
  console.log(`  votatis-api (dev) → http://localhost:${port}`);
  console.log(`  CORS web origin   → ${WEB_ORIGIN}`);
  console.log(
    `  seed: elections=${result.elections} reports=${result.reportsTotal} ` +
      `(verified=${result.reportsVerified}, pending=${result.reportsPending})`,
  );
  console.log("  admin login:");
  console.log(`    email    ${result.adminEmail}`);
  console.log(`    password ${result.adminPassword}`);
  console.log("");
}
