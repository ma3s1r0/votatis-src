import { handle } from "hono/aws-lambda";
import { createConfiguredApp } from "./server.js";

// AWS Lambda 핸들러 (API Gateway / Function URL). 로컬 dev 는 index.ts 사용.
// 콜드스타트 시 1회 env 로 createApp 구성 → 워밍 인스턴스 재사용.
// 필수 env 누락 시 이 시점에 throw(fail-fast). /health 는 DB 무관 200.
const app = createConfiguredApp();

export const handler = handle(app);
