import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

// 마운트 시 GET /api/elections 응답에 선거 1건 포함.
function electionsResponse() {
  return new Response(
    JSON.stringify({
      items: [{ id: "el-1", name: "제22대 국회의원선거", type: "national" }],
    }),
    { status: 200 },
  );
}

describe("ReportWizard Step5 요약", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("본문·출처 URL·발생 시점·선거명을 요약에 표시한다", async () => {
    renderWizard();
    // 선거 옵션 로드 대기
    await screen.findByRole("heading", { name: "제보하기" });

    // Step1
    await userEvent.type(screen.getByLabelText("제목"), "관찰 정황");
    await userEvent.type(
      screen.getByLabelText(/본문/),
      "특정 구간 득표율이 튀었다",
    );
    await userEvent.type(
      screen.getByLabelText("발생 시점"),
      "2026-06-01T09:30",
    );
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    // Step2: 분류 + 선거
    await userEvent.selectOptions(screen.getByLabelText("분류"), "투개표");
    await userEvent.selectOptions(
      await screen.findByLabelText(/선거/),
      "el-1",
    );
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    // Step3 지역 skip
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    // Step4: 출처 URL
    await userEvent.type(
      screen.getByLabelText("출처 URL"),
      "https://example.com/clip",
    );
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    // Step5 요약 검증
    const summary = await screen.findByRole("heading", { name: "검토·제출" });
    const section = summary.closest("section") as HTMLElement;
    expect(within(section).getByText("특정 구간 득표율이 튀었다")).toBeInTheDocument();
    expect(within(section).getByText("https://example.com/clip")).toBeInTheDocument();
    expect(within(section).getByText("2026-06-01T09:30")).toBeInTheDocument();
    // 선거는 ID 가 아니라 이름으로
    expect(within(section).getByText("제22대 국회의원선거")).toBeInTheDocument();
    expect(within(section).queryByText("el-1")).not.toBeInTheDocument();
  });

  it("동의 미체크 시 제출 비활성 사유 안내 텍스트가 보인다", async () => {
    renderWizard();
    await screen.findByRole("heading", { name: "제보하기" });
    await userEvent.type(screen.getByLabelText("제목"), "관찰 정황");
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByRole("button", { name: "제출" })).toBeDisabled();
    expect(screen.getByText(/동의가 필요합니다/)).toBeInTheDocument();
  });
});
