import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin/login" element={<div>로그인 페이지</div>} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <div>보호된 콘텐츠</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("me 가 401 이면 로그인 페이지로 리다이렉트한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(null, { status: 401 }),
    );
    renderApp();
    expect(await screen.findByText("로그인 페이지")).toBeInTheDocument();
    expect(screen.queryByText("보호된 콘텐츠")).not.toBeInTheDocument();
  });

  it("인증되면 (active) 자식을 렌더링한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "1",
          email: "a@b.com",
          role: "reviewer",
          status: "active",
        }),
        { status: 200 },
      ),
    );
    renderApp();
    expect(await screen.findByText("보호된 콘텐츠")).toBeInTheDocument();
  });

  it("확인 중에는 로딩 상태를 표시한다", async () => {
    let resolve: (v: Response) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    renderApp();
    expect(screen.getByText(/확인 중/)).toBeInTheDocument();
    resolve(
      new Response(
        JSON.stringify({
          id: "1",
          email: "a@b.com",
          role: "reviewer",
          status: "active",
        }),
        { status: 200 },
      ),
    );
    expect(await screen.findByText("보호된 콘텐츠")).toBeInTheDocument();
  });
});
