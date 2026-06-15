import { Hono } from "hono";
import type { Db } from "./db/repository.js";
import type { StoragePort } from "./storage.js";
import { createAuthApp } from "./auth-routes.js";
import { createReportApp } from "./report-routes.js";
import { createAdminApp } from "./admin-routes.js";

// 메인 앱 팩토리. db·storage 를 주입(0002 패턴)하고 하위 앱을 마운트한다.
//  - /api/auth/*  : 인증(0006). 로그인/세션/초대.
//  - /api/*       : 공개 제보 조회·수집(0002).
//  - /api/admin/* : 관리자 검토 콘솔(0004). 내부에서 requireReviewer 로 전부 보호.
export function createApp(opts: {
  db: Db;
  storage: StoragePort;
  submitterSalt?: string;
  inviteBaseUrl?: string;
}) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, service: "votatis-api" }));

  app.route("/api/auth", createAuthApp(opts.db, { inviteBaseUrl: opts.inviteBaseUrl }));
  app.route(
    "/api/admin",
    createAdminApp({ db: opts.db }),
  );
  app.route(
    "/api",
    createReportApp({
      db: opts.db,
      storage: opts.storage,
      submitterSalt: opts.submitterSalt,
    }),
  );

  return app;
}

// 기본 export: health 만 가진 정적 앱(lambda/dev 엔트리의 실 DB 배선은 후속).
export const app = new Hono();
app.get("/health", (c) => c.json({ ok: true, service: "votatis-api" }));

export default app;
