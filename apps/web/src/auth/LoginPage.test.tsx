import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./LoginPage";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/admin/login"]}>
      <Routes>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<div>관리자 홈</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("로그인 성공 시 /admin 으로 이동한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.com");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("관리자 홈")).toBeInTheDocument();
  });

  it("401 이면 이메일/비번을 구분하지 않는 에러 메시지를 표시한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_credentials" }), {
        status: 401,
      }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.com");
    await userEvent.type(screen.getByLabelText("비밀번호"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      await screen.findByText("이메일 또는 비밀번호가 올바르지 않습니다"),
    ).toBeInTheDocument();
    // 이동하지 않음
    expect(screen.queryByText("관리자 홈")).not.toBeInTheDocument();
  });

  it("429 이면 잠시 후 재시도 안내를 표시한다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("이메일"), "a@b.com");
    await userEvent.type(screen.getByLabelText("비밀번호"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(
      await screen.findByText(/잠시 후 다시 시도/),
    ).toBeInTheDocument();
  });

  it("성공 응답을 기다리는 동안 동일 메시지로 계정 존재를 누설하지 않는다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_credentials" }), {
        status: 401,
      }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("이메일"), "nobody@b.com");
    await userEvent.type(screen.getByLabelText("비밀번호"), "x");
    await userEvent.click(screen.getByRole("button", { name: "로그인" }));

    const msg = await screen.findByText(
      "이메일 또는 비밀번호가 올바르지 않습니다",
    );
    expect(msg).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/없는 계정|존재하지 않/)).not.toBeInTheDocument(),
    );
  });
});
