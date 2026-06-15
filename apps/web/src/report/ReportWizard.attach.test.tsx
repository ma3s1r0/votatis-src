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

// 첨부 단계(Step4)까지 진입
async function gotoAttachStep() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.selectOptions(screen.getByLabelText("분류"), "vote_count");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  // Step3 지역 (선택)
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  // Step4 출처·사진
}

describe("ReportWizard 첨부", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("허용 외 파일(초과 size)은 클라이언트에서 거부하고 안내를 표시한다", async () => {
    renderWizard();
    await gotoAttachStep();
    // 허용 mime 이지만 10MB 초과 — accept 필터를 통과해 onChange 가 발생.
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
    // 1) POST /api/reports
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_1", status: "received" }), {
        status: 201,
      }),
    );
    // 2) attachments/create
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
    // 3) PUT uploadUrl
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    // 4) finalize
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "stored" }), { status: 200 }),
    );

    renderWizard();
    await gotoAttachStep();
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    // Step5 검토·제출 → consent 후 제출
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    const calls = fetchMock.mock.calls;
    expect(calls[0][0]).toBe("/api/reports");
    expect(calls[1][0]).toBe("/api/reports/rep_1/attachments/create");
    expect(calls[2][0]).toBe("https://s3.example/upload");
    expect(calls[2][1].method).toBe("PUT");
    expect(calls[3][0]).toBe(
      "/api/reports/rep_1/attachments/att_1/finalize",
    );
  });
});
