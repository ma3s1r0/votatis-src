import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyReportsPage from "./MyReportsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/my"]}>
      <MyReportsPage />
    </MemoryRouter>,
  );
}

describe("MyReportsPage(0013 내 제보)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("빈 목록이면 안내 문구와 제보하기 링크를 보여준다", () => {
    renderPage();
    expect(screen.getByText(/아직 제보 내역이 없습니다/)).toBeInTheDocument();
    // TabBar 에도 "제보하기" 탭이 있으므로 빈 상태 CTA는 카드 안에서 찾는다.
    const card = screen
      .getByText(/아직 제보 내역이 없습니다/)
      .closest(".placeholder-card") as HTMLElement;
    expect(within(card).getByRole("link", { name: "제보하기" })).toHaveAttribute(
      "href",
      "/report",
    );
  });

  it("localStorage 의 접수번호 목록을 카드로 렌더한다", () => {
    localStorage.setItem(
      "votatis_my_reports",
      JSON.stringify(["VT-2026-0615-0042", "VT-2026-0614-0007"]),
    );
    renderPage();
    expect(screen.getByText("VT-2026-0615-0042")).toBeInTheDocument();
    expect(screen.getByText("VT-2026-0614-0007")).toBeInTheDocument();
  });

  it("항목의 상태조회 링크는 /track?number= 로 연결된다", () => {
    localStorage.setItem(
      "votatis_my_reports",
      JSON.stringify(["VT-2026-0615-0042"]),
    );
    renderPage();
    const link = screen.getByRole("link", { name: /VT-2026-0615-0042/ });
    expect(link).toHaveAttribute(
      "href",
      "/track?number=VT-2026-0615-0042",
    );
  });
});
