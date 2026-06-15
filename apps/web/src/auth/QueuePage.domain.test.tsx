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
    occurredAt: null,
    collectedAt: "2026-06-10T09:00:00Z",
    verified: false,
    domain: "election",
  },
];

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={["/admin/queue"]}>
      <Routes>
        <Route path="/admin/queue" element={<QueuePage />} />
        <Route path="/admin/login" element={<div>로그인 페이지</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function adminCalls(): string[] {
  const f = fetch as ReturnType<typeof vi.fn>;
  return f.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.startsWith("/api/admin/reports"));
}

describe("QueuePage 도메인 세그먼트(0014)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items, limit: 20, offset: 0 }), {
          status: 200,
        }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("집회 현장 세그먼트 선택 시 domain=assembly 로 관리자 조회한다", async () => {
    renderQueue();
    await screen.findByText("이상 득표율 제보");

    await userEvent.click(screen.getByRole("button", { name: "집회 현장" }));

    const last = adminCalls()[adminCalls().length - 1];
    expect(last).toContain("domain=assembly");
  });

  it("전체 세그먼트는 domain 쿼리 없이 조회한다", async () => {
    renderQueue();
    await screen.findByText("이상 득표율 제보");

    await userEvent.click(screen.getByRole("button", { name: "선거 의혹" }));
    await userEvent.click(screen.getByRole("button", { name: "전체" }));

    const last = adminCalls()[adminCalls().length - 1];
    expect(last).not.toContain("domain=");
  });
});
