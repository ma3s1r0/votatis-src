import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("QA 회귀 — 0003 빈틈 점검", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("미허용 mime 파일은 클라이언트에서 거부하고 안내를 표시한다", async () => {
    renderWizard();
    const bad = new File(["x"], "evil.exe", {
      type: "application/x-msdownload",
    });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), bad, {
      applyAccept: false,
    });
    expect(await screen.findByText(/이미지.*또는 PDF만/)).toBeInTheDocument();
  });

  it("429 실패 후에도 입력(상세 설명·consent)이 보존된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    renderWizard();
    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await waitFor(() =>
      expect(screen.getByText(/잠시 후 다시 시도/)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("상세 설명")).toHaveValue("관찰한 정황");
    expect(
      screen.getByRole("button", { name: "제보 제출" }),
    ).not.toBeDisabled();
  });

  it("sessionStorage 에 저장된 draft 로부터 복원된다(새로고침 시나리오)", async () => {
    sessionStorage.setItem(
      "votatis_report_draft",
      JSON.stringify({
        body: "복원된 설명",
        occurredAt: "",
        domain: "election",
        category: "투개표",
        electionId: "",
        sido: "",
        locationDetail: "",
        sourceUrl: "",
        consent: false,
      }),
    );
    renderWizard();
    expect((screen.getByLabelText("상세 설명") as HTMLTextAreaElement).value).toBe(
      "복원된 설명",
    );
    expect((screen.getByLabelText("의혹 유형") as HTMLSelectElement).value).toBe(
      "투개표",
    );
  });

  it("report 생성이 400 으로 실패하면 첨부(create) 는 호출되지 않는다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "validation_error", fields: { title: "짧음" } }),
        { status: 400 },
      ),
    );
    renderWizard();
    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    expect(await screen.findByText("짧음")).toBeInTheDocument();
    const reportCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/reports"),
    );
    await waitFor(() => expect(reportCalls.length).toBe(1));
    expect(reportCalls[0][0]).toBe("/api/reports");
  });
});
