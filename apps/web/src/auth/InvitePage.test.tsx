import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import InvitePage from "./InvitePage";

function renderInvite(token = "tok123") {
  return render(
    <MemoryRouter initialEntries={[`/admin/invite/${token}`]}>
      <Routes>
        <Route path="/admin/invite/:token" element={<InvitePage />} />
        <Route path="/admin/login" element={<div>로그인 페이지</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InvitePage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("200 이면 비밀번호 설정 성공 안내를 표시한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "active" }), { status: 200 }),
    );
    renderInvite();
    await userEvent.type(screen.getByLabelText("비밀번호"), "newpassword");
    await userEvent.click(screen.getByRole("button", { name: "비밀번호 설정" }));

    expect(
      await screen.findByRole("heading", { name: "비밀번호 설정 완료" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toBeInTheDocument();
  });

  it("410 이면 만료/사용됨 안내를 표시한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "gone" }), { status: 410 }),
    );
    renderInvite();
    await userEvent.type(screen.getByLabelText("비밀번호"), "newpassword");
    await userEvent.click(screen.getByRole("button", { name: "비밀번호 설정" }));

    expect(
      await screen.findByText(/만료.*되었거나.*사용|만료되었거나 이미 사용/),
    ).toBeInTheDocument();
  });
});
