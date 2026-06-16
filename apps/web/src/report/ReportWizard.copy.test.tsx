import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

describe("ReportForm 안내 카피 (객관적 톤)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("상단에 검수·책임을 알리는 객관적 안내 문구가 있다(Figma 02)", () => {
    renderWizard();
    expect(
      screen.getByText(/제보는 관리자 검수 후 처리됩니다/),
    ).toBeInTheDocument();
  });
});
