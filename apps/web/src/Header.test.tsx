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
  it("공개 헤더는 로고만 노출한다(주 내비는 하단 탭바)", () => {
    renderHeader();
    // 로고 = 홈 링크
    const home = screen.getByRole("link", { name: /Votatis/ });
    expect(home).toHaveAttribute("href", "/");
    // 공개 모드에선 헤더에 추가 내비 링크가 없다.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: /공개 아카이브/ }),
    ).not.toBeInTheDocument();
  });

  it("admin 모드에서는 로그아웃 동작을 노출한다", () => {
    const onLogout = () => {};
    renderHeader({ admin: true, onLogout });
    expect(
      screen.getByRole("button", { name: /로그아웃/ }),
    ).toBeInTheDocument();
  });
});
