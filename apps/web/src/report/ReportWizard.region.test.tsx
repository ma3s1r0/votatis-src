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

// Step3(지역)까지 진입하는 헬퍼
async function gotoRegionStep() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  // Step2 분류
  await userEvent.selectOptions(screen.getByLabelText("분류"), "투개표");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  // Step3 지역
}

describe("ReportWizard 지역 종속 드롭다운", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("시도 선택 전에는 시군구/읍면동이 비활성", async () => {
    renderWizard();
    await gotoRegionStep();
    expect(screen.getByText(/3\s*\/\s*5/)).toBeInTheDocument();
    expect(screen.getByLabelText("시군구")).toBeDisabled();
    expect(screen.getByLabelText("읍면동")).toBeDisabled();
  });

  it("시도 선택 후 시군구 활성, 시군구 선택 후 읍면동 활성", async () => {
    renderWizard();
    await gotoRegionStep();

    await userEvent.selectOptions(screen.getByLabelText("시도"), "서울특별시");
    const sigungu = screen.getByLabelText("시군구");
    expect(sigungu).not.toBeDisabled();
    expect(screen.getByLabelText("읍면동")).toBeDisabled();

    await userEvent.selectOptions(sigungu, "강남구");
    const dong = screen.getByLabelText("읍면동");
    expect(dong).not.toBeDisabled();
    // 종속 옵션이 반영됨
    await userEvent.selectOptions(dong, "신사동");
    expect((dong as HTMLSelectElement).value).toBe("신사동");
  });

  it("시도를 바꾸면 하위 선택이 초기화된다", async () => {
    renderWizard();
    await gotoRegionStep();

    await userEvent.selectOptions(screen.getByLabelText("시도"), "서울특별시");
    await userEvent.selectOptions(screen.getByLabelText("시군구"), "강남구");
    await userEvent.selectOptions(screen.getByLabelText("시도"), "부산광역시");
    expect((screen.getByLabelText("시군구") as HTMLSelectElement).value).toBe("");
    expect(screen.getByLabelText("읍면동")).toBeDisabled();
  });
});
