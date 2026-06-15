import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

describe("ReportWizard 단계 이동", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("5단계 마법사가 렌더되고 현재 진행도가 표시된다", () => {
    renderWizard();
    expect(screen.getByText(/1\s*\/\s*5/)).toBeInTheDocument();
    // Step 1 = 상황 설명
    expect(screen.getByLabelText("제목")).toBeInTheDocument();
  });

  it("Step1 제목 미입력 시 다음으로 진행할 수 없다", async () => {
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    // 여전히 Step1
    expect(screen.getByText(/1\s*\/\s*5/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("Step1 제목 입력 후 Step2 분류로 이동하고, 분류는 선택 사항이라 미선택도 다음 진행(미분류 허용, 0007)", async () => {
    renderWizard();
    await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    // Step2
    expect(screen.getByText(/2\s*\/\s*5/)).toBeInTheDocument();
    expect(screen.getByLabelText("분류")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    // 분류 미선택이어도 Step3 으로 진행
    expect(screen.getByText(/3\s*\/\s*5/)).toBeInTheDocument();
  });

  it("이전 버튼으로 직전 단계로 돌아간다", async () => {
    renderWizard();
    await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText(/2\s*\/\s*5/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByText(/1\s*\/\s*5/)).toBeInTheDocument();
  });
});
