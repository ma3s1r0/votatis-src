import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

describe("App (홈 랜딩)", () => {
  it("히어로 슬로건 헤드라인을 렌더링한다", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("민주주의의 꽃 선거,");
    expect(heading).toHaveTextContent("기술과 팩트로 지킵니다");
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

  it("히어로 CTA가 공용 버튼 클래스(btn-primary/btn-secondary)를 사용한다", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const ctaNav = screen.getByRole("navigation", { name: "주요 행동" });
    expect(ctaNav.querySelector("a.btn.btn-primary")).not.toBeNull();
    expect(ctaNav.querySelector("a.btn.btn-secondary")).not.toBeNull();
  });
});
