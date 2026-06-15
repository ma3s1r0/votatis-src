import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

// Step5 검토·제출까지 진입 (첨부 없음)
async function gotoSubmitStep() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.selectOptions(screen.getByLabelText("분류"), "vote_count");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" })); // 지역 skip
  await userEvent.click(screen.getByRole("button", { name: "다음" })); // 출처 skip
  // Step5
}

describe("ReportWizard 제출", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("consent 미동의 시 제출 버튼이 비활성", async () => {
    renderWizard();
    await gotoSubmitStep();
    expect(screen.getByRole("button", { name: "제출" })).toBeDisabled();
  });

  it("제출 성공 시 POST /api/reports 가 호출되고 완료 화면이 보이며 상태가 초기화된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_9", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();
    await gotoSubmitStep();
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    expect(
      await screen.findByRole("heading", { name: "제보가 접수되었습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/rep_9/)).toBeInTheDocument();
    // POST body 검증
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.title).toBe("관찰한 정황");
    expect(body.consent).toBe(true);
    // sessionStorage 클리어
    expect(sessionStorage.getItem("votatis_report_draft")).toBeNull();
  });

  it("400 validation_error 시 필드 에러를 표시하고 입력을 보존한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "validation_error",
          fields: { title: "제목이 너무 짧습니다" },
        }),
        { status: 400 },
      ),
    );
    renderWizard();
    await gotoSubmitStep();
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    expect(
      await screen.findByText("제목이 너무 짧습니다"),
    ).toBeInTheDocument();
    // 완료 화면으로 넘어가지 않음 — 제출 버튼 여전히 존재
    expect(screen.getByRole("button", { name: "제출" })).toBeInTheDocument();
  });

  it("429 시 잠시 후 재시도 안내를 표시한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    renderWizard();
    await gotoSubmitStep();
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() =>
      expect(screen.getByText(/잠시 후 다시 시도/)).toBeInTheDocument(),
    );
  });
});
