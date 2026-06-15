import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ReportDetailPage from "./ReportDetailPage";

// 0017 2인 교차검증 — 콘솔 상세/판정 폼.

const baseDetail = {
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
  attachments: [],
  sources: [],
  verification: null,
  verificationHistory: [],
  crossVerification: { approvals: 0, required: 2, approvers: [] },
};

const me = {
  id: "rev-1",
  email: "a@votatis.test",
  role: "reviewer",
  status: "active",
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

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// 상세 + me 두 호출을 순서 무관하게 응답하는 fetch mock.
function mockLoad(detail: unknown, meBody: unknown = me) {
  (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes("/api/auth/me")) return Promise.resolve(jsonRes(meBody));
    return Promise.resolve(jsonRes(detail));
  });
}

async function fillEvidence() {
  await userEvent.type(screen.getByLabelText("검증 방법"), "교차 확인");
  const links = screen.getByTestId("evidence-link-0");
  await userEvent.type(within(links).getByLabelText("URL"), "https://e.com/x");
  await userEvent.type(
    within(links).getByLabelText("수집 시각"),
    "2026-06-12T10:00",
  );
  await userEvent.type(within(links).getByLabelText("콘텐츠 해시"), "hash1");
}

describe("ReportDetailPage 교차검증(0017)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("상세에 교차검증 진행도 N/2 를 렌더한다", async () => {
    mockLoad({
      ...baseDetail,
      crossVerification: { approvals: 1, required: 2, approvers: ["rev-9"] },
    });
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    expect(screen.getByText(/교차검증/)).toBeInTheDocument();
    expect(screen.getByText(/1\s*\/\s*2/)).toBeInTheDocument();
  });

  it("동의 버튼은 '검증 승인(동의)' 라벨이다", async () => {
    mockLoad(baseDetail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    expect(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    ).toBeInTheDocument();
  });

  it("동의 제출 후 응답의 진행도로 N/2 를 갱신한다", async () => {
    mockLoad(baseDetail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);
    await fillEvidence();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonRes({ approvals: 1, required: 2 }, 201),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    );

    expect(await screen.findByText(/1\s*\/\s*2/)).toBeInTheDocument();
  });

  it("2/2 충족 응답이면 '검증 완료' 상태를 표시한다", async () => {
    mockLoad(baseDetail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);
    await fillEvidence();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonRes({ approvals: 2, required: 2 }, 201),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    );

    expect(await screen.findByText(/검증 완료/)).toBeInTheDocument();
  });

  it("이미 2/2 인 상세는 '검증 완료'를 보여주고 동의 버튼을 비활성한다", async () => {
    mockLoad({
      ...baseDetail,
      verified: true,
      crossVerification: {
        approvals: 2,
        required: 2,
        approvers: ["rev-8", "rev-9"],
      },
    });
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    expect(screen.getByText(/검증 완료/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    ).toBeDisabled();
  });

  it("409 already_approved 시 '이미 동의' 안내를 보이고 버튼을 비활성한다", async () => {
    mockLoad(baseDetail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);
    await fillEvidence();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonRes({ error: "already_approved" }, 409),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    );

    expect(await screen.findByText(/이미 동의/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    ).toBeDisabled();
  });

  it("본인이 이미 approvers 에 있으면 동의 버튼이 비활성이다", async () => {
    mockLoad({
      ...baseDetail,
      crossVerification: { approvals: 1, required: 2, approvers: ["rev-1"] },
    });
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다/);

    expect(
      screen.getByRole("button", { name: /검증 승인\(동의\)/ }),
    ).toBeDisabled();
  });
});
