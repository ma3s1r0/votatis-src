import { defineConfig } from "vitest/config";

// pglite beforeEach 셋업이 병렬 부하에서 기본 10s hookTimeout 으로 가끔 실패 →
// 타임아웃만 넉넉히 상향(테스트 로직·풀 설정은 기본 유지).
export default defineConfig({
  test: {
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
