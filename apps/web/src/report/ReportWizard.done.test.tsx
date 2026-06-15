import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

function electionsResponse() {
  return new Response(JSON.stringify({ items: [] }), { status: 200 });
}

async function submitOnce() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByLabelText(/동의/));
  await userEvent.click(screen.getByRole("button", { name: "제출" }));
}

describe("ReportWizard 완료 화면", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("완료 화면에 아카이브·홈·추가 제보 링크가 있다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_42", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();
    await submitOnce();

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });

    const archive = screen.getByRole("link", { name: /아카이브/ });
    expect(archive).toHaveAttribute("href", "/archive");
    const home = screen.getByRole("link", { name: /^홈$/ });
    expect(home).toHaveAttribute("href", "/");
    // 추가 제보(새 빈 마법사로 진입)
    expect(
      screen.getByRole("button", { name: /새 제보|추가 제보/ }),
    ).toBeInTheDocument();
  });

  it("접수번호 문구는 추적 불가를 오해하지 않게 정정한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_42", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();
    await submitOnce();
    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });

    expect(screen.getByText(/접수 식별자/)).toBeInTheDocument();
    expect(screen.getByText(/조회하는 기능은 제공되지 않습니다/)).toBeInTheDocument();
  });

  it("추가 제보 클릭 시 새 빈 마법사로 진입한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_42", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();
    await submitOnce();
    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });

    await userEvent.click(
      screen.getByRole("button", { name: /새 제보|추가 제보/ }),
    );

    expect(screen.getByLabelText("제목")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "제보하기" })).toBeInTheDocument();
  });
});
