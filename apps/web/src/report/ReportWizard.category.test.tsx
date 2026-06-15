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

// GET /api/elections 응답을 1회 모킹한다(마운트 시 호출).
function mockElections() {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        items: [
          { id: "el-1", name: "제22대 국회의원선거", type: "national" },
          { id: "el-2", name: "제8회 지방선거", type: "local" },
        ],
      }),
      { status: 200 },
    ),
  );
}

describe("ReportForm 분류·선거(0007)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("분류 옵션이 서버 category enum 값으로 렌더된다", () => {
    mockElections();
    renderWizard();

    const select = screen.getByLabelText("의혹 유형") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining([
        "투개표",
        "사전투표",
        "전산집계",
        "개표참관",
        "명부·선거인",
        "시스템·장비",
        "기타",
      ]),
    );
  });

  it("GET /api/elections 로 선거 드롭다운 옵션을 채운다", async () => {
    mockElections();
    renderWizard();

    expect(
      await screen.findByRole("option", { name: "제22대 국회의원선거" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "제8회 지방선거" }),
    ).toBeInTheDocument();
  });

  it("제출 시 category·electionId 를 POST 본문에 전송한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockElections();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_1", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();

    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    await userEvent.selectOptions(screen.getByLabelText("의혹 유형"), "투개표");
    await screen.findByRole("option", { name: "제22대 국회의원선거" });
    await userEvent.selectOptions(screen.getByLabelText(/선거/), "el-1");
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/reports" && c[1]?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall![1].body);
    expect(body.category).toBe("투개표");
    expect(body.electionId).toBe("el-1");
  });

  it("선거 미선택도 제출 가능하며 electionId 를 전송하지 않는다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockElections();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_2", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();

    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    await userEvent.selectOptions(screen.getByLabelText("의혹 유형"), "기타");
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/reports" && c[1]?.method === "POST",
    );
    const body = JSON.parse(postCall![1].body);
    expect(body.category).toBe("기타");
    expect(body.electionId).toBeUndefined();
  });

  it("분류 미선택도 제출 가능하며 category 를 전송하지 않는다(미분류 접수)", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockElections();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_3", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();

    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/reports" && c[1]?.method === "POST",
    );
    const body = JSON.parse(postCall![1].body);
    expect(body.category).toBeUndefined();
  });
});
