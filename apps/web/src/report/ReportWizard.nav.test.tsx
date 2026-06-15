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

describe("ReportForm 단일 페이지(0019)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("단계 네비 없이 핵심 입력이 한 화면에 모두 보인다", () => {
    renderWizard();
    expect(screen.getByLabelText("의혹 유형")).toBeInTheDocument();
    expect(screen.getByLabelText("위치")).toBeInTheDocument();
    expect(screen.getByLabelText("상세 설명")).toBeInTheDocument();
    expect(screen.getByLabelText("사진/PDF 첨부")).toBeInTheDocument();
    // 위저드 잔재(다음/이전/단계 인디케이터)가 없다
    expect(screen.queryByRole("button", { name: "다음" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이전" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\/\s*5\s*단계/)).not.toBeInTheDocument();
  });

  it("동의 전에는 제출 버튼이 비활성", () => {
    renderWizard();
    expect(screen.getByRole("button", { name: "제보 제출" })).toBeDisabled();
  });
});
