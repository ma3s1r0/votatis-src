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

describe("ReportWizard 안내 카피 (관찰·기록 톤)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("Step1 에 단정이 아닌 관찰·기록을 유도하는 안내가 있다", () => {
    renderWizard();
    expect(
      screen.getByText(/관찰한 사실을 그대로 기록/),
    ).toBeInTheDocument();
  });
});
