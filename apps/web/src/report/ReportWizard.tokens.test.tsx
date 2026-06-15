import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";

// 핵심 화면이 raw hex/px 가 아니라 디자인 토큰(var(--...))을 참조하는지 단언한다.
// 시각(픽셀) 비교가 아니라 토큰이 single source of truth 임을 보이는 최소 확인.
function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

describe("ReportWizard 디자인 토큰 적용", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("Step1 섹션이 토큰 var() 를 참조한다", () => {
    renderWizard();
    const section = screen.getByText("상황 설명").closest("section");
    expect(section).not.toBeNull();
    expect(section!.getAttribute("style")).toContain("var(--color-surface)");
  });
});
