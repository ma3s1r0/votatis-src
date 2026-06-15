import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";

// 핵심 화면이 raw hex/px 인라인이 아니라 토큰 기반 공용 클래스(app.css)를 쓰는지 단언한다.
// (단일 페이지화 0019: 인라인 style 제거 → .container/.btn/.field 등 토큰 클래스 사용)
function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

describe("ReportForm 디자인 토큰 적용", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("토큰 기반 공용 클래스를 사용하고 인라인 raw hex 색상이 없다", () => {
    const { container } = renderWizard();
    expect(container.querySelector("main.container")).not.toBeNull();
    expect(container.querySelector(".btn.btn-primary")).not.toBeNull();
    // 인라인 style 에 raw hex 색상이 남아있지 않다(토큰/클래스로 이관됨).
    for (const el of Array.from(container.querySelectorAll("[style]"))) {
      expect(el.getAttribute("style")).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
  });
});
