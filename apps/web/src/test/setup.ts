import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest globals 미사용 → RTL 자동 cleanup 미등록. 테스트 간 DOM 정리를 수동 등록.
afterEach(() => {
  cleanup();
});
