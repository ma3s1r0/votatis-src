import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ArchiveDetailPage from "./ArchiveDetailPage";

// 0018-B: 공개 상세에 서버가 내려준 viewCount를 표시한다.
const detail = {
  id: "r1",
  title: "이상 득표율 기록",
  body: "본문",
  sido: "서울특별시",
  sigungu: "강남구",
  eupMyeonDong: "역삼동",
  occurredAt: null,
  collectedAt: "2026-06-10T09:00:00Z",
  category: "투개표",
  election: null,
  verification: null,
  attachments: [],
  sources: [],
  viewCount: 42,
};

function mockOnce(body: unknown, status = 200) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/archive/r1"]}>
      <Routes>
        <Route path="/archive/:id" element={<ArchiveDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ArchiveDetailPage viewCount", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("응답의 viewCount를 화면에 표시한다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText("이상 득표율 기록");

    expect(screen.getByText(/조회/)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });
});
