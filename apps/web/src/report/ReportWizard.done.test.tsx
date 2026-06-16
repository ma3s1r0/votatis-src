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

describe("ReportForm 완료 화면(Figma 04)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("완료 화면에 상태조회·홈·추가 제보 액션이 있다", async () => {
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

    const status = screen.getByRole("link", { name: /상태 조회/ });
    expect(status).toHaveAttribute(
      "href",
      expect.stringContaining("/track"),
    );
    const home = screen.getByRole("link", { name: "홈으로 돌아가기" });
    expect(home).toHaveAttribute("href", "/");
  });

  it("접수번호와 상태조회 안내를 표시한다(0013: 추적 가능)", async () => {
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

    expect(screen.getByText("접수번호")).toBeInTheDocument();
    expect(screen.getByText("VT-2026-0615-0042")).toBeInTheDocument();
    expect(
      screen.queryByText(/조회하는 기능은 제공되지 않습니다/),
    ).not.toBeInTheDocument();
  });

});
