import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TrackStatusPage from "./TrackStatusPage";

function renderPage(initial = "/track") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <TrackStatusPage />
    </MemoryRouter>,
  );
}

function timelineResponse(currentStage: string, publicUrl: string | null) {
  const stages = [
    { stage: "received", label: "접수됨" },
    { stage: "reviewing", label: "검수중" },
    { stage: "verified", label: "검증완료" },
    { stage: "published", label: "공개" },
  ];
  const idx = stages.findIndex((s) => s.stage === currentStage);
  return new Response(
    JSON.stringify({
      trackingNumber: "VT-2026-0615-0042",
      currentStage,
      publicUrl,
      timeline: stages.map((s, i) => ({
        ...s,
        state: i < idx ? "done" : i === idx ? "current" : "upcoming",
      })),
    }),
    { status: 200 },
  );
}

describe("TrackStatusPage(0013 상태조회)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("유효 번호 입력 → 타임라인 단계가 렌더되고 현재 단계가 강조된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(timelineResponse("reviewing", null));
    renderPage();

    await userEvent.type(
      screen.getByLabelText(/접수번호/),
      "VT-2026-0615-0042",
    );
    await userEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(await screen.findByText("접수됨")).toBeInTheDocument();
    expect(screen.getByText("검수중")).toBeInTheDocument();
    expect(screen.getByText("검증완료")).toBeInTheDocument();
    expect(screen.getByText("공개")).toBeInTheDocument();

    // 현재 단계(검수중)는 current 표시.
    const current = screen.getByText("검수중").closest("li");
    expect(current?.className).toContain("current");
  });

  it("공개(publicUrl 있음)면 아카이브 상세로 가는 링크가 보인다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(timelineResponse("published", "/reports/rep_42"));
    renderPage();

    await userEvent.type(
      screen.getByLabelText(/접수번호/),
      "VT-2026-0615-0042",
    );
    await userEvent.click(screen.getByRole("button", { name: "조회" }));

    const link = await screen.findByRole("link", { name: /공개 보기/ });
    expect(link).toHaveAttribute("href", "/archive/rep_42");
  });

  it("없는 번호(404)는 안내 메시지를 보여준다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText(/접수번호/), "VT-2026-0615-9999");
    await userEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(await screen.findByText(/찾을 수 없습니다/)).toBeInTheDocument();
  });

  it("rate limit(429)은 안내 메시지를 보여준다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText(/접수번호/), "VT-2026-0615-0042");
    await userEvent.click(screen.getByRole("button", { name: "조회" }));

    expect(await screen.findByText(/요청이 많습니다/)).toBeInTheDocument();
  });

  it("URL 쿼리(?number=)로 들어오면 자동 조회한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(timelineResponse("received", null));
    renderPage("/track?number=VT-2026-0615-0042");

    expect(await screen.findByText("검증완료")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/track/VT-2026-0615-0042",
    );
  });
});
