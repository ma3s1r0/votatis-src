import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import ArchiveListPage from "./ArchiveListPage";

function LocationProbe({ onChange }: { onChange: (l: string) => void }) {
  const loc = useLocation();
  useEffect(() => {
    onChange(loc.search);
  }, [loc.search, onChange]);
  return null;
}

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

// GET /api/elections 응답(마운트 시 선거 필터 옵션 로드). 목록 mock 다음에 호출됨.
function mockElections() {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        items: [
          { id: "el-1", name: "제22대 국회의원선거", type: "national" },
          { id: "el-2", name: "제8회 지방선거", type: "local" },
        ],
      }),
      { status: 200 },
    ),
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

  it("수집 시점을 ISO 원문이 아닌 사람이 읽는 형식으로 표시한다", async () => {
    mockOnce(page1);
    renderList();
    await screen.findByText("이상 득표율 기록");

    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
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

describe("ArchiveListPage 검색 디바운스/필터 일관성", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("검색어 입력을 디바운스 후 q 파라미터로 반영하며, 연속 입력은 1회로 합쳐진다", async () => {
    const { waitFor } = await import("@testing-library/react");
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce(page1); // 초기 로드
    mockElections();
    renderList();
    await screen.findByText("이상 득표율 기록");

    const before = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });

    // 연속 타이핑(디바운스로 합쳐져야 함)
    await userEvent.type(screen.getByRole("searchbox", { name: /검색/ }), "득표율");

    await waitFor(() =>
      expect(lastUrl()).toContain("q=%EB%93%9D%ED%91%9C%EC%9C%A8"),
    );
    // 글자별이 아니라 1회로 합쳐진다
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1);
  });

  it("검색어 입력 후 필터(지역)를 바꿔도 검색어가 유실되지 않는다", async () => {
    const { waitFor } = await import("@testing-library/react");
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce(page1);
    mockElections();
    renderList();
    await screen.findByText("이상 득표율 기록");

    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    await userEvent.type(screen.getByRole("searchbox", { name: /검색/ }), "득표율");
    await waitFor(() =>
      expect(lastUrl()).toContain("q=%EB%93%9D%ED%91%9C%EC%9C%A8"),
    );

    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /지역/ }),
      "서울특별시",
    );

    const url = lastUrl();
    expect(url).toContain("sido=%EC%84%9C%EC%9A%B8");
    expect(url).toContain("q=%EB%93%9D%ED%91%9C%EC%9C%A8");
    // 검색 입력칸도 값을 유지한다
    expect(screen.getByRole("searchbox", { name: /검색/ })).toHaveValue("득표율");
  });
});

describe("ArchiveListPage 쿼리스트링 동기화", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("URL 쿼리스트링의 q/sido 를 초기 query 로 사용한다", async () => {
    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    mockElections();
    renderList("/archive?q=%EB%93%9D%ED%91%9C%EC%9C%A8&sido=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C");
    await screen.findByText("이상 득표율 기록");

    // 최초 fetch 가 쿼리스트링 값을 반영
    const f = fetch as ReturnType<typeof vi.fn>;
    const first = String(f.mock.calls[0][0]);
    expect(first).toContain("q=%EB%93%9D%ED%91%9C%EC%9C%A8");
    expect(first).toContain("sido=%EC%84%9C%EC%9A%B8");
    // 검색 입력칸에도 복원
    expect(screen.getByRole("searchbox", { name: /검색/ })).toHaveValue("득표율");
  });

  it("필터 변경 시 URL 쿼리스트링에 반영된다", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce(page1);
    mockElections();
    let location: string | undefined;
    render(
      <MemoryRouter initialEntries={["/archive"]}>
        <Routes>
          <Route path="/archive" element={<ArchiveListPage />} />
        </Routes>
        <LocationProbe onChange={(l) => (location = l)} />
      </MemoryRouter>,
    );
    await screen.findByText("이상 득표율 기록");

    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /지역/ }),
      "서울특별시",
    );

    expect(location).toContain("sido=");
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

  // 0007: 0005 스코프 결정("category 필터 미지원")을 해제 — 필터 복원.
  it("분류(category) 선택 시 category 파라미터로 재요청한다", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce(page1);
    mockElections();
    renderList();
    await screen.findByText("이상 득표율 기록");

    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /분류/ }),
      "투개표",
    );

    expect(lastUrl()).toContain("category=%ED%88%AC%EA%B0%9C%ED%91%9C");
  });

  it("GET /api/elections 로 선거 필터 옵션을 채우고, 선택 시 electionId 로 재요청한다", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockOnce(page1);
    mockElections();
    renderList();
    await screen.findByText("이상 득표율 기록");

    await screen.findByRole("option", { name: "제22대 국회의원선거" });

    mockOnce({ items: [page1.items[0]], total: 1, limit: 20, offset: 0 });
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /선거/ }),
      "el-1",
    );

    expect(lastUrl()).toContain("electionId=el-1");
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
