import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ArchiveListPage from "./ArchiveListPage";

const page1 = {
  items: [
    {
      id: "r1",
      title: "이상 득표율 기록",
      body: "특정 구간에서 득표율이 비정상적으로 튀었다는 기록.",
      sido: "서울특별시",
      sigungu: "강남구",
      eupMyeonDong: "역삼동",
      occurredAt: "2024-04-10T00:00:00Z",
      collectedAt: "2026-06-10T09:00:00Z",
    },
    {
      id: "r2",
      title: "사전투표 절차 기록",
      body: null,
      sido: "부산광역시",
      sigungu: "해운대구",
      eupMyeonDong: null,
      occurredAt: null,
      collectedAt: "2026-06-11T09:00:00Z",
    },
  ],
  total: 2,
  limit: 20,
  offset: 0,
};

function renderList(entry = "/archive") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/archive" element={<ArchiveListPage />} />
        <Route path="/archive/:id" element={<div>상세 화면</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockOnce(body: unknown, status = 200) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

function lastUrl(): string {
  const f = fetch as ReturnType<typeof vi.fn>;
  return String(f.mock.calls[f.mock.calls.length - 1][0]);
}

describe("ArchiveListPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("서버가 반환한 verified 항목 목록을 렌더한다", async () => {
    mockOnce(page1);
    renderList();

    expect(await screen.findByText("이상 득표율 기록")).toBeInTheDocument();
    expect(screen.getByText("사전투표 절차 기록")).toBeInTheDocument();
  });

  it("결과가 없으면 안내 문구를 보인다", async () => {
    mockOnce({ items: [], total: 0, limit: 20, offset: 0 });
    renderList();

    expect(
      await screen.findByText(/조건에 맞는 기록이 없습니다/),
    ).toBeInTheDocument();
  });

  it("데이터/검증 중심의 객관적 톤 카피를 유지한다(단정 카피 없음)", async () => {
    mockOnce(page1);
    renderList();
    await screen.findByText("이상 득표율 기록");

    expect(screen.queryByText(/부정선거/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/검증을 거친 기록만 공개합니다/),
    ).toBeInTheDocument();
  });
});

describe("ArchiveListPage 검색", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("검색어 입력 후 제출하면 q 파라미터로 재요청한다", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce(page1); // 초기 로드
    renderList();
    await screen.findByText("이상 득표율 기록");

    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    await userEvent.type(
      screen.getByRole("searchbox", { name: /검색/ }),
      "득표율",
    );
    await userEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(lastUrl()).toContain("q=%EB%93%9D%ED%91%9C%EC%9C%A8");
  });
});

describe("ArchiveListPage 필터", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("지역(sido) 선택 시 sido 파라미터로 재요청한다", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce(page1);
    renderList();
    await screen.findByText("이상 득표율 기록");

    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /지역/ }),
      "서울특별시",
    );

    expect(lastUrl()).toContain("sido=%EC%84%9C%EC%9A%B8");
  });

  it("분류(category) 필터 UI가 없다(서버 미지원)", async () => {
    mockOnce(page1);
    renderList();
    await screen.findByText("이상 득표율 기록");

    expect(
      screen.queryByRole("combobox", { name: /분류/ }),
    ).not.toBeInTheDocument();
  });
});

describe("ArchiveListPage 페이지네이션", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("다음 페이지 클릭 시 offset을 늘려 재요청한다", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce({
      items: page1.items,
      total: 45,
      limit: 20,
      offset: 0,
    });
    renderList();
    await screen.findByText("이상 득표율 기록");

    mockOnce({ items: page1.items, total: 45, limit: 20, offset: 20 });
    await userEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(lastUrl()).toContain("offset=20");
  });
});

describe("ArchiveListPage 상태", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("에러 시 에러 안내를 보인다", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network"),
    );
    renderList();

    expect(
      await screen.findByText(/목록을 불러오지 못했습니다/),
    ).toBeInTheDocument();
  });
});
