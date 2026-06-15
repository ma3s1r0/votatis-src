import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ArchiveDetailPage from "./ArchiveDetailPage";

const detail = {
  id: "r1",
  title: "이상 득표율 기록",
  body: "특정 구간에서 득표율이 비정상적으로 튀었다는 기록.",
  sido: "서울특별시",
  sigungu: "강남구",
  eupMyeonDong: "역삼동",
  occurredAt: "2024-04-10T00:00:00Z",
  collectedAt: "2026-06-10T09:00:00Z",
  category: "투개표",
  election: { id: "el-1", name: "제22대 국회의원선거" },
  verification: {
    verified: true,
    validity: "부분 확인",
    severity: "중간",
    method: "공개 개표 데이터 교차 확인",
    notes: "공개 통계 범위 내에서만 대조함.",
    unverifiedClaims: "조작 의도가 있었다는 주장",
  },
  attachments: [
    {
      id: "a1",
      filename: "scan.pdf",
      mime: "application/pdf",
      size: 12345,
      sha256: "deadbeef",
    },
  ],
  sources: [
    {
      id: "s1",
      kind: "web",
      url: "https://example.com/orig",
      capturedAt: "2026-06-10T09:00:00Z",
      contentHash: "abc123",
      archiveUrl: "https://archive.example/snap",
    },
  ],
};

function renderDetail(entry = "/archive/r1") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/archive/:id" element={<ArchiveDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockOnce(body: unknown, status = 200) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("ArchiveDetailPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("본문·출처(스냅샷)를 표시한다", async () => {
    mockOnce(detail);
    renderDetail();

    expect(
      await screen.findByText(/비정상적으로 튀었다는 기록/),
    ).toBeInTheDocument();
    expect(screen.getByText(/example\.com\/orig/)).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it("검토 요약(확인 범위·심각도·방법·확인되지 않은 주장)을 표시한다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    // 검증 방법(어디까지 확인됐는지)
    expect(
      screen.getByText(/공개 개표 데이터 교차 확인/),
    ).toBeInTheDocument();
    // 심각도(문자열)
    expect(screen.getByText(/심각도/)).toBeInTheDocument();
    expect(screen.getByText("중간")).toBeInTheDocument();
    // 확인 범위(유효성, 문자열)
    expect(screen.getByText(/부분 확인/)).toBeInTheDocument();
    // "확인되지 않은 주장"
    expect(screen.getByText(/확인되지 않은 주장/)).toBeInTheDocument();
    expect(
      screen.getByText(/조작 의도가 있었다는 주장/),
    ).toBeInTheDocument();
  });

  it("분류(category)·선거(election 이름)를 표시한다(0007)", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    expect(screen.getByText(/분류 투개표/)).toBeInTheDocument();
    expect(
      screen.getByText(/선거 제22대 국회의원선거/),
    ).toBeInTheDocument();
  });

  it("첨부는 파일명·크기를 표기하고 깨진 다운로드 링크를 만들지 않는다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    const filename = screen.getByText(/scan\.pdf/);
    expect(filename).toBeInTheDocument();
    // 다운로드 URL이 없으므로 앵커 링크가 아니어야 한다.
    expect(filename.closest("a")).toBeNull();
  });

  it("미검증/없는 ID(404)는 Not Found 화면을 보이고 본문을 노출하지 않는다", async () => {
    mockOnce({ error: "not_found" }, 404);
    renderDetail();

    expect(
      await screen.findByText(/기록을 찾을 수 없습니다/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/비정상적으로 튀었다는 기록/),
    ).not.toBeInTheDocument();
  });

  it("로딩 상태를 보인다", async () => {
    // fetch가 즉시 resolve되지 않게 보류
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise(() => {}),
    );
    renderDetail();
    expect(screen.getByText(/불러오는 중/)).toBeInTheDocument();
  });
});
