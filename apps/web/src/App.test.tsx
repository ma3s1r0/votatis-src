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

  it("주 CTA(제보)와 상태 조회 링크를 제공한다(Figma 01)", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const ctaNav = screen.getByRole("navigation", { name: "주요 행동" });
    expect(ctaNav.querySelector('a[href="/report"]')).not.toBeNull();
    expect(ctaNav.querySelector('a[href="/track"]')).not.toBeNull();
  });

  it("주 CTA가 공용 버튼 클래스(btn-primary)를 사용한다", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const ctaNav = screen.getByRole("navigation", { name: "주요 행동" });
    expect(ctaNav.querySelector("a.btn.btn-primary")).not.toBeNull();
  });
});
