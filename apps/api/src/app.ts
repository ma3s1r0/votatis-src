import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Db } from "./db/repository.js";
import type { StoragePort } from "./storage.js";
import { createAuthApp } from "./auth-routes.js";
import { createReportApp } from "./report-routes.js";
import { createAdminApp } from "./admin-routes.js";
import { createGeocodeApp } from "./geocode-routes.js";
import { loadRegionPolygons } from "./geocode/dataset.js";
import { FakeMosaic, type MosaicPort } from "./mosaic.js";

// 메인 앱 팩토리. db·storage 를 주입(0002 패턴)하고 하위 앱을 마운트한다.
//  - /api/auth/*  : 인증(0006). 로그인/세션/초대.
//  - /api/*       : 공개 제보 조회·수집(0002).
//  - /api/admin/* : 관리자 검토 콘솔(0004). 내부에서 requireReviewer 로 전부 보호.
export function createApp(opts: {
  db: Db;
  storage: StoragePort;
  // 0016 공표 처리(모자이크) 포트. 미주입 시 FakeMosaic(비목표: 실 얼굴검출은 후속 인프라).
  mosaic?: MosaicPort;
  submitterSalt?: string;
  inviteBaseUrl?: string;
  secureCookies?: boolean;
}) {
  const app = new Hono();
  const mosaic = opts.mosaic ?? new FakeMosaic();

  app.get("/health", (c) => c.json({ ok: true, service: "votatis-api" }));

  app.route(
    "/api/auth",
    createAuthApp(opts.db, {
      inviteBaseUrl: opts.inviteBaseUrl,
      secureCookies: opts.secureCookies,
    }),
  );
  app.route(
    "/api/admin",
    createAdminApp({ db: opts.db, storage: opts.storage, mosaic }),
  );
  app.route(
    "/api",
    createReportApp({
      db: opts.db,
      storage: opts.storage,
      submitterSalt: opts.submitterSalt,
    }),
  );
  // 0021 역지오코딩(EXIF GPS → 시군구). 데이터 미탑재 시 region=null(graceful).
  app.route("/api/geocode", createGeocodeApp(loadRegionPolygons()));

  return app;
}

// 엔트리 구성 함수. createApp 에 CORS 를 입혀 운영/dev 엔트리가 동일하게 쓴다.
//  - CORS 는 0006 쿠키 인증 때문에 명시 오리진 + credentials:true (와일드카드 금지).
//    corsOrigins 가 비어있으면 동일 오리진 배포로 보고 CORS 미적용.
//  - /health 는 DB·구성과 무관하게 200(로드밸런서 헬스용).
export function buildApp(opts: {
  db: Db;
  storage: StoragePort;
  mosaic?: MosaicPort;
  corsOrigins: string[];
  submitterSalt?: string;
  inviteBaseUrl?: string;
  secureCookies?: boolean;
}) {
  const app = new Hono();

  if (opts.corsOrigins.length > 0) {
    const allow = new Set(opts.corsOrigins);
    app.use(
      "*",
      cors({
        origin: (origin) => (allow.has(origin) ? origin : null),
        credentials: true,
      }),
    );
  }

  app.route(
    "/",
    createApp({
      db: opts.db,
      storage: opts.storage,
      mosaic: opts.mosaic,
      submitterSalt: opts.submitterSalt,
      inviteBaseUrl: opts.inviteBaseUrl,
      secureCookies: opts.secureCookies,
    }),
  );

  return app;
}

// 기본 export: health 만 가진 정적 앱(lambda/dev 엔트리의 실 DB 배선은 후속).
export const app = new Hono();
app.get("/health", (c) => c.json({ ok: true, service: "votatis-api" }));

export default app;
