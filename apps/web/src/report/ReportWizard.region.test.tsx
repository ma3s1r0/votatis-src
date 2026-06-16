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

// Figma 02 위치: 단일 입력칸. 제출 시 앞부분에서 시도를 파싱해 구조화 보존.
describe("ReportForm 위치 입력(단일 입력칸)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("위치 입력칸 하나가 한 화면에 있다", () => {
    renderWizard();
    expect(screen.getByLabelText("위치")).toBeInTheDocument();
  });

  it("입력한 위치 값이 반영된다", async () => {
    renderWizard();
    await userEvent.type(
      screen.getByLabelText("위치"),
      "서울특별시 강남구 제3투표소",
    );
    expect(screen.getByLabelText("위치")).toHaveValue("서울특별시 강남구 제3투표소");
  });

  it("제출 시 시도(파싱)와 위치 전문(sigungu)을 본문에 전송한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_r", status: "received" }), {
        status: 201,
      }),
    );
    renderWizard();
    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    await userEvent.type(
      screen.getByLabelText("위치"),
      "서울특별시 강남구 제3투표소",
    );
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await screen.findByRole("heading", { name: "제보가 접수되었습니다" });
    const postCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/reports" && c[1]?.method === "POST",
    );
    const body = JSON.parse(postCall![1].body);
    // 앞부분이 알려진 시도면 sido 로 구조화(지도/지역 필터 보존)
    expect(body.sido).toBe("서울특별시");
    expect(body.sigungu).toBe("서울특별시 강남구 제3투표소");
  });
});
