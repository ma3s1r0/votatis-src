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

describe("ReportForm 첨부", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("허용 외 파일(초과 size)은 클라이언트에서 거부하고 안내를 표시한다", async () => {
    renderWizard();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), big);
    expect(
      await screen.findByText(/10MB를 넘을 수 없습니다/),
    ).toBeInTheDocument();
  });

  it("제출 시 report 생성 후 첨부가 create→PUT→finalize 순서로 호출된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse()); // 마운트: GET /api/elections
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_1", status: "received" }), {
        status: 201,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          attachmentId: "att_1",
          storageKey: "k",
          uploadUrl: "https://s3.example/upload",
          method: "PUT",
          expiresInSeconds: 600,
        }),
        { status: 201 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "stored" }), { status: 200 }),
    );

    renderWizard();
    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    const reportCalls = () =>
      fetchMock.mock.calls.filter((c) => c[0] !== "/api/elections");
    await waitFor(() => expect(reportCalls().length).toBe(4));
    const calls = reportCalls();
    expect(calls[0][0]).toBe("/api/reports");
    expect(calls[1][0]).toBe("/api/reports/rep_1/attachments/create");
    expect(calls[2][0]).toBe("https://s3.example/upload");
    expect(calls[2][1].method).toBe("PUT");
    expect(calls[3][0]).toBe("/api/reports/rep_1/attachments/att_1/finalize");
  });
});
