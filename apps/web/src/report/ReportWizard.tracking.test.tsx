import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";
import { getMyReports } from "../track/storage";

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

function createResponse(trackingNumber: string) {
  return new Response(
    JSON.stringify({ id: "rep_42", status: "received", trackingNumber }),
    { status: 201 },
  );
}

async function submitOnce() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByLabelText(/동의/));
  await userEvent.click(screen.getByRole("button", { name: "제출" }));
}

describe("ReportWizard 접수번호 추적(0013)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("완료 화면에 접수번호를 강조 표시한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(createResponse("VT-2026-0615-0042"));
    renderWizard();
    await submitOnce();

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    expect(screen.getByText("VT-2026-0615-0042")).toBeInTheDocument();
  });

  it("완료 시 접수번호를 localStorage(내 제보)에 적재한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(createResponse("VT-2026-0615-0042"));
    renderWizard();
    await submitOnce();

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    expect(getMyReports()).toContain("VT-2026-0615-0042");
  });

  it("상태 조회 링크가 /track 으로 연결된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(createResponse("VT-2026-0615-0042"));
    renderWizard();
    await submitOnce();

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    const link = screen.getByRole("link", { name: /상태 조회/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("/track"));
  });
});
