import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ReportDetailPage from "./ReportDetailPage";

const detail = {
  id: "r1",
  title: "이상 득표율 제보",
  body: "특정 구간에서 득표율이 비정상적으로 튀었다.",
  status: "pending_review",
  sido: "서울특별시",
  sigungu: "강남구",
  eupMyeonDong: "역삼동",
  occurredAt: "2024-04-10T00:00:00Z",
  collectedAt: "2026-06-10T09:00:00Z",
  verified: false,
  attachments: [{ id: "a1", filename: "scan.pdf", url: "/files/scan.pdf" }],
  sources: [
    {
      id: "s1",
      url: "https://example.com/orig",
      capturedAt: "2026-06-10T09:00:00Z",
      contentHash: "abc123",
      archiveUrl: null,
    },
  ],
  verification: null,
  verificationHistory: [],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/admin/reports/r1"]}>
      <Routes>
        <Route path="/admin/reports/:id" element={<ReportDetailPage />} />
        <Route path="/admin/queue" element={<div>검토 큐 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockOnce(body: unknown, status = 200) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("ReportDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("제보 본문·첨부·출처를 표시한다", async () => {
    mockOnce(detail);
    renderDetail();

    expect(
      await screen.findByText(/득표율이 비정상적으로 튀었다/),
    ).toBeInTheDocument();
    expect(screen.getByText("scan.pdf")).toBeInTheDocument();
    expect(screen.getByText(/example\.com\/orig/)).toBeInTheDocument();
  });

  it("method/근거 링크 없이 제출은 클라이언트에서 차단된다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    const submit = await screen.findByRole("button", { name: "판정 제출" });
    expect(submit).toBeDisabled();

    // method만 채워도 근거 0개면 여전히 차단
    await userEvent.type(screen.getByLabelText("검증 방법"), "교차 확인");
    expect(submit).toBeDisabled();
  });

  it("서버 422 응답 시 fields 에러를 화면에 표시한다", async () => {
    mockOnce(detail); // 상세 로드
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    // 근거 링크 1개 추가
    await userEvent.type(screen.getByLabelText("검증 방법"), "교차 확인");
    await userEvent.click(
      screen.getByRole("button", { name: "근거 링크 추가" }),
    );
    const links = screen.getByTestId("evidence-link-0");
    await userEvent.type(
      within(links).getByLabelText("URL"),
      "https://e.com/x",
    );
    await userEvent.type(
      within(links).getByLabelText("수집 시각"),
      "2026-06-12T10:00",
    );
    await userEvent.type(
      within(links).getByLabelText("콘텐츠 해시"),
      "hash1",
    );

    // 서버가 422 반환
    mockOnce(
      {
        error: "validation_error",
        fields: [{ field: "method", reason: "required" }],
      },
      422,
    );
    await userEvent.click(screen.getByRole("button", { name: "판정 제출" }));

    expect(await screen.findByText(/method/)).toBeInTheDocument();
    expect(screen.getByText(/required/)).toBeInTheDocument();
  });

  it("정상 판정 제출 시 201 성공 처리한다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    await userEvent.type(screen.getByLabelText("검증 방법"), "교차 확인");
    await userEvent.click(
      screen.getByRole("button", { name: "근거 링크 추가" }),
    );
    const links = screen.getByTestId("evidence-link-0");
    await userEvent.type(
      within(links).getByLabelText("URL"),
      "https://e.com/x",
    );
    await userEvent.type(
      within(links).getByLabelText("수집 시각"),
      "2026-06-12T10:00",
    );
    await userEvent.type(
      within(links).getByLabelText("콘텐츠 해시"),
      "hash1",
    );

    mockOnce({ id: "v1" }, 201);
    await userEvent.click(screen.getByRole("button", { name: "판정 제출" }));

    expect(
      await screen.findByText(/판정이 저장되었습니다/),
    ).toBeInTheDocument();
  });
});
