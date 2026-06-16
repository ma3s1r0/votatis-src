import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ArchiveListPage from "./ArchiveListPage";

const page = {
  items: [
    {
      id: "r1",
      title: "이상 득표율 기록",
      body: "본문",
      sido: "서울특별시",
      sigungu: "강남구",
      eupMyeonDong: "역삼동",
      occurredAt: null,
      collectedAt: "2026-06-10T09:00:00Z",
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

function renderList(entry = "/archive") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/archive" element={<ArchiveListPage />} />
        <Route path="/archive/:id" element={<div>상세 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function reportsCalls(): string[] {
  const f = fetch as ReturnType<typeof vi.fn>;
  return f.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.startsWith("/api/reports"));
}

describe("ArchiveListPage 도메인 세그먼트(0014)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (String(url).startsWith("/api/elections")) {
          return Promise.resolve(
            new Response(JSON.stringify({ items: [] }), { status: 200 }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(page), { status: 200 }),
        );
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("집회 신고 세그먼트 선택 시 domain=assembly 쿼리로 재요청한다", async () => {
    renderList();
    await screen.findByText("이상 득표율 기록");

    await userEvent.click(screen.getByRole("button", { name: "집회 신고" }));

    const last = reportsCalls()[reportsCalls().length - 1];
    expect(last).toContain("domain=assembly");
  });

  it("집회 신고 세그먼트 선택 시 분류 옵션이 assembly 분류로 바뀐다", async () => {
    renderList();
    await screen.findByText("이상 득표율 기록");

    await userEvent.click(screen.getByRole("button", { name: "집회 신고" }));

    const select = screen.getByLabelText("분류") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining(["집회·시위", "충돌·물리력", "채증·촬영"]),
    );
    expect(values).not.toContain("투개표");
  });

  it("기본 진입 시 선거 의혹(election)으로 요청하고 전체 탭은 없다(Figma 06)", async () => {
    renderList();
    await screen.findByText("이상 득표율 기록");

    expect(
      screen.queryByRole("button", { name: "전체" }),
    ).not.toBeInTheDocument();
    const first = reportsCalls()[0];
    expect(first).toContain("domain=election");
  });
});
