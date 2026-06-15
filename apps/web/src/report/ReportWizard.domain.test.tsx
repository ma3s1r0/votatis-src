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

function postCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(
    (c) => c[0] === "/api/reports" && c[1]?.method === "POST",
  );
}

describe("ReportForm 도메인 세그먼트(0014)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("기본 도메인은 election이며 분류 옵션이 election 종류다", () => {
    renderWizard();
    const select = screen.getByLabelText("의혹 유형") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining(["투개표", "사전투표", "기타"]),
    );
    expect(values).not.toContain("채증·촬영");
  });

  it("집회 현장 도메인 선택 시 분류 옵션이 assembly 분류로 전환된다", async () => {
    renderWizard();
    await userEvent.click(screen.getByRole("button", { name: "집회 현장" }));

    const select = screen.getByLabelText("의혹 유형") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining(["집회·시위", "충돌·물리력", "채증·촬영", "기타"]),
    );
    expect(values).not.toContain("투개표");
  });

  it("제출 payload에 선택한 domain을 포함한다(assembly)", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_a", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();

    await userEvent.type(screen.getByLabelText("상세 설명"), "집회 현장 관찰");
    await userEvent.click(screen.getByRole("button", { name: "집회 현장" }));
    await userEvent.selectOptions(screen.getByLabelText("의혹 유형"), "채증·촬영");
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    const body = JSON.parse(postCall(fetchMock)![1].body);
    expect(body.domain).toBe("assembly");
    expect(body.category).toBe("채증·촬영");
  });

  it("도메인 전환 시 다른 도메인 분류값은 초기화된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_b", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();

    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰");
    // election 분류 선택 후 집회로 전환 → 분류 초기화
    await userEvent.selectOptions(screen.getByLabelText("의혹 유형"), "투개표");
    await userEvent.click(screen.getByRole("button", { name: "집회 현장" }));
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    const body = JSON.parse(postCall(fetchMock)![1].body);
    expect(body.domain).toBe("assembly");
    expect(body.category).toBeUndefined();
  });
});
