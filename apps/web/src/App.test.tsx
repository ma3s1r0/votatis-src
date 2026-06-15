import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

describe("App (홈 랜딩)", () => {
  it("제목 Votatis 를 렌더링한다", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Votatis" }),
    ).toBeInTheDocument();
  });

  it("Vite 스캐폴드 문구를 노출하지 않는다", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/스캐폴드/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vite \+ React/)).not.toBeInTheDocument();
  });

  it("CTA 2개(아카이브·제보)를 제공한다", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    // 헤더에도 같은 링크가 있으므로 본문 CTA 영역에서 확인.
    const ctaNav = screen.getByRole("navigation", { name: "주요 행동" });
    expect(
      ctaNav.querySelector('a[href="/archive"]'),
    ).not.toBeNull();
    expect(ctaNav.querySelector('a[href="/report"]')).not.toBeNull();
  });
});
