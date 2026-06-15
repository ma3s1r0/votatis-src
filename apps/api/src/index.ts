import { serve } from "@hono/node-server";
import { createConfiguredApp } from "./server.js";

// 로컬 dev 엔트리. env(DATABASE_URL, S3 설정 등)로 실 드라이버 구성.
// 필수 env 누락 시 createConfiguredApp 이 throw → 기동 실패(조용한 기본값 없음).
const app = createConfiguredApp();

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`votatis-api dev server: http://localhost:${port}`);
