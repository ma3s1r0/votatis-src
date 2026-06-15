import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

describe("App", () => {
  it("제목 Votatis 를 렌더링한다", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Votatis" })).toBeInTheDocument();
  });
});
