import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPostgresDb } from "./db/postgres.js";
import { S3Storage } from "./storage.js";

// env → 실 DB(node-postgres)·S3 드라이버로 앱 구성. lambda/dev 엔트리가 공유한다.
// 필수 env 누락 시 loadConfig 가 throw → 기동 단계 fail-fast.
export function createConfiguredApp(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const db = createPostgresDb(config.databaseUrl);
  const storage = new S3Storage(config.s3);
  return buildApp({
    db,
    storage,
    corsOrigins: config.corsOrigins,
    submitterSalt: config.submitterSalt,
    inviteBaseUrl: config.inviteBaseUrl,
  });
}
