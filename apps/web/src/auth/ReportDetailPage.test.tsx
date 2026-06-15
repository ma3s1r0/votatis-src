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

  it("지역·발생/수집 시점 맥락을 표시하고 날짜는 ISO 원문이 아니다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/득표율이 비정상적으로 튀었다/);

    expect(screen.getByText(/서울특별시/)).toBeInTheDocument();
    expect(screen.getByText(/발생/)).toBeInTheDocument();
    // ISO 원문(T...Z)이 노출되지 않는다.
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("기존 판정 이력이 있으면 목록으로 표시한다", async () => {
    mockOnce({
      ...detail,
      verificationHistory: [
        {
          version: 1,
          archivedAt: "2026-06-09T08:00:00Z",
          snapshot: { method: "1차 검토", validity: "unclear" },
        },
      ],
    });
    renderDetail();
    await screen.findByText(/득표율이 비정상적으로 튀었다/);

    expect(screen.getByText(/판정 이력/)).toBeInTheDocument();
    expect(screen.getByText(/1차 검토/)).toBeInTheDocument();
  });

  it("출처 해시는 축약 표시하고 title 에 전체값을 담는다", async () => {
    const full =
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    mockOnce({
      ...detail,
      sources: [{ ...detail.sources[0], contentHash: full }],
    });
    renderDetail();
    await screen.findByText(/득표율이 비정상적으로 튀었다/);

    expect(screen.queryByText(new RegExp(full))).not.toBeInTheDocument();
    const short = screen.getByText(/abcdef0123…/);
    expect(short.closest("[title]")?.getAttribute("title")).toContain(full);
  });

  it("유효성 선택지를 한글 라벨로 표시한다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/득표율이 비정상적으로 튀었다/);

    const validity = screen.getByLabelText("유효성");
    expect(within(validity).getByRole("option", { name: "부분 확인" })).toBeInTheDocument();
    expect(within(validity).getByRole("option", { name: "확인됨" })).toBeInTheDocument();
  });

  it("method/근거 링크 없이 제출은 클라이언트에서 차단된다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    const submit = await screen.findByRole("button", {
      name: /검증 승인\(동의\)/,
    });
    expect(submit).toBeDisabled();

    // method만 채워도 근거 URL 미입력이면 여전히 차단
    await userEvent.type(screen.getByLabelText("검증 방법"), "교차 확인");
    expect(submit).toBeDisabled();
  });

  it("판정 폼 진입 시 근거 링크 입력 블록이 기본 1개 펼쳐져 있다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    expect(screen.getByTestId("evidence-link-0")).toBeInTheDocument();
  });

  it("unverifiedClaims 입력값이 submitVerification payload 에 포함된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    await userEvent.type(screen.getByLabelText("검증 방법"), "교차 확인");
    await userEvent.type(
      screen.getByLabelText("확인되지 않은 주장"),
      "투표지 분류기 조작 주장은 확인 못 함",
    );
    const links = screen.getByTestId("evidence-link-0");
    await userEvent.type(within(links).getByLabelText("URL"), "https://e.com/x");
    await userEvent.type(
      within(links).getByLabelText("수집 시각"),
      "2026-06-12T10:00",
    );
    await userEvent.type(within(links).getByLabelText("콘텐츠 해시"), "hash1");

    mockOnce({ approvals: 1, required: 2 }, 201);
    await userEvent.click(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    );
    await screen.findByText(/이미 동의하셨습니다/);

    const post = fetchMock.mock.calls.find(
      (c) => c[1]?.method === "POST",
    );
    const body = JSON.parse(post![1].body);
    expect(body.unverifiedClaims).toBe("투표지 분류기 조작 주장은 확인 못 함");
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
    await userEvent.click(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    );

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

    mockOnce({ approvals: 1, required: 2 }, 201);
    await userEvent.click(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    );

    expect(
      await screen.findByText(/이미 동의하셨습니다/),
    ).toBeInTheDocument();
  });
});
