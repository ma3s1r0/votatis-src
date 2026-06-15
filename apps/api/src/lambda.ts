import { handle } from "hono/aws-lambda";
import app from "./app.js";

// AWS Lambda 핸들러 (API Gateway / Function URL). 로컬 dev 는 index.ts 사용.
export const handler = handle(app);
