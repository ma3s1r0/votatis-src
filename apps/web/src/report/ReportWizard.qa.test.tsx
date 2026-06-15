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

async function gotoSubmitStep() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.selectOptions(screen.getByLabelText("분류"), "투개표");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" })); // 지역 skip
  await userEvent.click(screen.getByRole("button", { name: "다음" })); // 출처 skip
}

async function gotoAttachStep() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.selectOptions(screen.getByLabelText("분류"), "투개표");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" })); // 지역 skip
}

// 마운트 시 GET /api/elections(0007) 1회 호출. 기본 응답은 빈 선거 목록.
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

  // 수용기준: 허용 외 파일(미허용 mime)도 클라이언트에서 거부
  it("미허용 mime 파일은 클라이언트에서 거부하고 안내를 표시한다", async () => {
    renderWizard();
    await gotoAttachStep();
    const bad = new File(["x"], "evil.exe", {
      type: "application/x-msdownload",
    });
    // accept 속성이 OS 다이얼로그에서 필터하더라도, 우회/드래그 등으로
    // 미허용 파일이 onChange 까지 도달하는 경우를 가정(applyAccept:false).
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), bad, {
      applyAccept: false,
    });
    expect(
      await screen.findByText(/이미지.*또는 PDF만/),
    ).toBeInTheDocument();
  });

  // 수용기준: 제출 실패(429) 시에도 입력이 보존된다
  it("429 실패 후에도 입력(제목·consent)이 보존된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse()); // 마운트: GET /api/elections
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    renderWizard();
    await gotoSubmitStep();
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() =>
      expect(screen.getByText(/잠시 후 다시 시도/)).toBeInTheDocument(),
    );
    // 요약에 제목이 그대로 남아있고, 제출 버튼이 다시 활성(consent 유지)
    expect(screen.getByText("관찰한 정황")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제출" })).not.toBeDisabled();
  });

  // 결정4: 새로고침 시 sessionStorage 로부터 복원
  it("sessionStorage 에 저장된 draft 로부터 복원된다(새로고침 시나리오)", async () => {
    sessionStorage.setItem(
      "votatis_report_draft",
      JSON.stringify({
        step: 2,
        title: "복원된 제목",
        body: "",
        occurredAt: "",
        category: "투개표",
        sido: "",
        sigungu: "",
        eupMyeonDong: "",
        sourceUrl: "",
        consent: false,
      }),
    );
    renderWizard();
    // 복원 step 으로 진입
    expect(screen.getByText(/2\s*\/\s*5/)).toBeInTheDocument();
    expect(
      (screen.getByLabelText("분류") as HTMLSelectElement).value,
    ).toBe("투개표");
    // 이전 단계로 돌아가면 복원된 제목이 보임
    await userEvent.click(screen.getByRole("button", { name: "이전" }));
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe(
      "복원된 제목",
    );
  });

  // 수용기준: report 생성 후에만 첨부 — report 생성 실패 시 첨부 호출 안 함
  it("report 생성이 400 으로 실패하면 첨부(create) 는 호출되지 않는다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse()); // 마운트: GET /api/elections
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "validation_error", fields: { title: "짧음" } }),
        { status: 400 },
      ),
    );
    renderWizard();
    await gotoAttachStep();
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    expect(await screen.findByText("짧음")).toBeInTheDocument();
    // reports POST 단 1회만(첨부 create 미호출). elections(마운트) 제외하고 카운트.
    const reportCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/reports"),
    );
    await waitFor(() => expect(reportCalls.length).toBe(1));
    expect(reportCalls[0][0]).toBe("/api/reports");
  });
});
