import { startDevServer } from "./dev-server.js";

// 로컬 dev 엔트리(pnpm --filter @votatis/api dev → tsx watch src/index.ts).
// 실 RDS/S3 불필요 — pglite 인메모리 + InMemoryStorage + 부팅 시드.
// 운영 배포는 lambda.ts(createConfiguredApp, 실 env) 를 사용한다.
startDevServer().catch((err) => {
  console.error("dev server failed to start:", err);
  process.exit(1);
});
