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
  return new Response(JSON.stringify({ items: [] }), { status: 200 });
}

async function submitOnce() {
  await userEvent.type(screen.getByLabelText("상세 설명"), "관찰 정황");
  await userEvent.click(screen.getByLabelText(/동의/));
  await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));
}

describe("ReportForm 완료 화면 접수번호 클립보드 복사(0013)", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("복사 버튼 클릭 시 접수번호가 클립보드에 기록되고 피드백을 보여준다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "rep_42",
          status: "received",
          trackingNumber: "VT-2026-0615-0042",
        }),
        { status: 201 },
      ),
    );
    renderWizard();
    await submitOnce();
    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });

    const copyBtn = screen.getByRole("button", { name: "복사" });
    await userEvent.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith("VT-2026-0615-0042");
    expect(await screen.findByText("복사됨")).toBeInTheDocument();
  });

  it("접수번호가 없으면 복사 버튼을 표시하지 않는다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_42", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();
    await submitOnce();
    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });

    expect(screen.queryByRole("button", { name: "복사" })).not.toBeInTheDocument();
  });
});
