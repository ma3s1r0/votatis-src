import { serve } from "@hono/node-server";
import { createHash } from "node:crypto";
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
  // dev 업로드가 실제로 동작하도록 presignPut 이 수신 라우트(/api/dev/blob/)를 가리키게 한다.
  const storage = new InMemoryStorage("/api/dev/blob/");
  const result = await seed(db, storage);

  const app = buildApp({
    db,
    storage,
    // 쿠키 세션(credentials:true) → 와일드카드 금지, 로컬 web 오리진 명시.
    corsOrigins: [WEB_ORIGIN],
    submitterSalt: "votatis-dev-salt",
    inviteBaseUrl: `${WEB_ORIGIN}/invite`,
    // dev/LAN 은 HTTP — secure 쿠키면 모바일(http://192.168…)에서 세션 저장이 안 돼 로그인 실패.
    secureCookies: false,
  });

  // dev 전용 업로드 수신: presignPut 의 /api/dev/blob/<key> 로 PUT 된 바이트를
  // InMemoryStorage 에 저장해 finalize(headObject) 가 통과하도록 한다(운영은 실 S3).
  app.put("/api/dev/blob/*", async (c) => {
    const key = decodeURIComponent(
      c.req.path.replace(/^\/api\/dev\/blob\//, ""),
    );
    const buf = Buffer.from(await c.req.arrayBuffer());
    const sha256 = createHash("sha256").update(buf).digest("hex");
    storage.put(key, buf.length, sha256);
    return c.body(null, 200);
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
