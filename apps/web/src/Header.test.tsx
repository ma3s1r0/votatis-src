import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "./Header";

function renderHeader(props?: Parameters<typeof Header>[0]) {
  return render(
    <MemoryRouter>
      <Header {...props} />
    </MemoryRouter>,
  );
}

describe("Header (공통 네비)", () => {
  it("로고(홈 링크)와 공개 아카이브·제보 링크를 제공한다", () => {
    renderHeader();
    // 로고 = 홈 링크
    const home = screen.getByRole("link", { name: /Votatis/ });
    expect(home).toHaveAttribute("href", "/");
    // 아카이브
    const archive = screen.getByRole("link", { name: /공개 아카이브/ });
    expect(archive).toHaveAttribute("href", "/archive");
    // 제보
    const report = screen.getByRole("link", { name: /제보/ });
    expect(report).toHaveAttribute("href", "/report");
  });

  it("admin 모드에서는 로그아웃 동작을 노출한다", () => {
    const onLogout = () => {};
    renderHeader({ admin: true, onLogout });
    expect(
      screen.getByRole("button", { name: /로그아웃/ }),
    ).toBeInTheDocument();
  });
});
