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
  viewCount: 7,
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

  it("첨부 다운로드 클릭 → 다운로드 엔드포인트 호출 후 받은 URL로 이동한다", async () => {
    mockOnce(detail); // 상세 로드
    const assign = vi.fn();
    vi.stubGlobal("location", { assign } as unknown as Location);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    // 다운로드 엔드포인트 응답.
    mockOnce({ url: "https://fake-s3.local/x?method=GET", expiresInSeconds: 300 });

    const btn = screen.getByRole("button", { name: /다운로드/ });
    btn.click();

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/reports/r1/attachments/a1/download");
      expect(assign).toHaveBeenCalledWith("https://fake-s3.local/x?method=GET");
    });
  });

  it("날짜를 ISO 원문이 아닌 사람이 읽는 형식으로 표시한다", async () => {
    mockOnce(detail);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    // ISO 원문(2026-06-10T09:00:00Z)이 화면에 노출되지 않는다.
    expect(
      screen.queryByText(/2026-06-10T09:00:00Z/),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("출처 해시는 축약 표시하고 title 에 전체값을 담는다", async () => {
    const longHash = {
      ...detail,
      sources: [
        {
          ...detail.sources[0],
          contentHash:
            "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        },
      ],
    };
    mockOnce(longHash);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    // 64자 통째 노출 없음
    expect(
      screen.queryByText(
        /abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789/,
      ),
    ).not.toBeInTheDocument();
    const short = screen.getByText(/abcdef0123…/);
    expect(short).toBeInTheDocument();
    const titled = short.closest("[title]");
    expect(titled?.getAttribute("title")).toContain(
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    );
  });

  it("validity/severity 를 한글 라벨로 표시한다", async () => {
    const labeled = {
      ...detail,
      verification: {
        ...detail.verification,
        validity: "partly",
        severity: "3",
      },
    };
    mockOnce(labeled);
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    expect(screen.getByText(/부분 확인/)).toBeInTheDocument();
    expect(screen.getByText(/보통/)).toBeInTheDocument();
    // enum 코드 원문은 노출하지 않는다.
    expect(screen.queryByText(/^partly$/)).not.toBeInTheDocument();
  });

  it("다운로드 발급 실패 시 일반 오류 메시지를 노출한다", async () => {
    mockOnce(detail); // 상세 로드
    renderDetail();
    await screen.findByText(/비정상적으로 튀었다는 기록/);

    // 다운로드 엔드포인트 404
    mockOnce({ error: "not_found" }, 404);
    const btn = screen.getByRole("button", { name: /다운로드/ });
    btn.click();

    expect(
      await screen.findByText(/다운로드를 준비할 수 없습니다/),
    ).toBeInTheDocument();
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
