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

function electionsResponse() {
  return new Response(
    JSON.stringify({
      items: [{ id: "el-1", name: "제22대 국회의원선거", type: "national" }],
    }),
    { status: 200 },
  );
}

describe("ReportForm 단일 페이지 입력 유지", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("상세 설명·발생 시점·선거 선택이 한 화면의 각 필드에 유지된다", async () => {
    renderWizard();
    await screen.findByLabelText("상세 설명");

    await userEvent.type(
      screen.getByLabelText("상세 설명"),
      "특정 구간 득표율이 튀었다",
    );
    await userEvent.selectOptions(screen.getByLabelText("의혹 유형"), "투개표");
    // 추가 정보(선택) 안의 선거·발생 시점
    await userEvent.selectOptions(await screen.findByLabelText(/선거/), "el-1");
    await userEvent.type(screen.getByLabelText("발생 시점"), "2026-06-01T09:30");

    expect(screen.getByLabelText("상세 설명")).toHaveValue(
      "특정 구간 득표율이 튀었다",
    );
    expect(screen.getByLabelText("발생 시점")).toHaveValue("2026-06-01T09:30");
    expect((screen.getByLabelText(/선거/) as HTMLSelectElement).value).toBe(
      "el-1",
    );
    expect(
      screen.getByRole("option", { name: "제22대 국회의원선거" }),
    ).toBeInTheDocument();
  });

  it("동의 미체크 시 제출 비활성 + 동의 필요 안내가 보인다", async () => {
    renderWizard();
    await screen.findByLabelText("상세 설명");

    expect(screen.getByRole("button", { name: "제보 제출" })).toBeDisabled();
    expect(screen.getByText(/동의가 필요합니다/)).toBeInTheDocument();
  });
});
