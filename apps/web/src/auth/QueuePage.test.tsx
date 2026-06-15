import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import QueuePage from "./QueuePage";

const items = [
  {
    id: "r1",
    title: "이상 득표율 제보",
    body: "본문",
    status: "pending_review",
    sido: "서울특별시",
    sigungu: "강남구",
    eupMyeonDong: "역삼동",
    occurredAt: "2024-04-10T00:00:00Z",
    collectedAt: "2026-06-10T09:00:00Z",
    verified: false,
  },
  {
    id: "r2",
    title: "사전투표 통계 이상",
    body: "본문2",
    status: "pending_review",
    sido: "부산광역시",
    sigungu: "해운대구",
    eupMyeonDong: null,
    occurredAt: null,
    collectedAt: "2026-06-11T09:00:00Z",
    verified: false,
  },
];

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={["/admin/queue"]}>
      <Routes>
        <Route path="/admin/queue" element={<QueuePage />} />
        <Route path="/admin/reports/:id" element={<div>상세 화면 {":id"}</div>} />
        <Route path="/admin/login" element={<div>로그인 페이지</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("QueuePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("검토 큐에 mock 제보들의 제목·지역·수집시점을 렌더한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ items, limit: 20, offset: 0 }), {
        status: 200,
      }),
    );
    renderQueue();

    expect(
      await screen.findByText("이상 득표율 제보"),
    ).toBeInTheDocument();
    expect(screen.getByText("사전투표 통계 이상")).toBeInTheDocument();
    // 지역 표기
    expect(screen.getByText(/서울특별시/)).toBeInTheDocument();
    expect(screen.getByText(/강남구/)).toBeInTheDocument();
  });

  it("항목을 클릭하면 상세 화면으로 이동한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ items, limit: 20, offset: 0 }), {
        status: 200,
      }),
    );
    renderQueue();

    const link = await screen.findByRole("link", { name: /이상 득표율 제보/ });
    await userEvent.click(link);
    expect(await screen.findByText(/상세 화면/)).toBeInTheDocument();
  });
});
