import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router-dom";
import MapPage from "../MapPage";

// 0018 지도 뷰. map-stats 호출 → 시도 핀 + 범례. fetch mock.

function mockMapStats(items: unknown) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
    new Response(JSON.stringify({ items }), { status: 200 }),
  );
}

// 이동 경로를 캡처하는 위치 프로브.
function LocationProbe() {
  const [params] = useSearchParams();
  return <div data-testid="probe">{params.toString()}</div>;
}

function renderMap(entry = "/map") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/map" element={<MapPage />} />
        <Route path="/archive" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SAMPLE = [
  { sido: "서울특별시", total: 5, byStatus: { verified: 4, reviewing: 1, unverified: 0 } },
  { sido: "부산광역시", total: 2, byStatus: { verified: 0, reviewing: 0, unverified: 2 } },
  { sido: null, total: 3, byStatus: { verified: 1, reviewing: 1, unverified: 1 } },
];

describe("MapPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("진입 시 map-stats를 호출하고 시도 핀과 범례 건수를 렌더한다", async () => {
    mockMapStats(SAMPLE);
    renderMap();

    // 핀: 서울 핀(aria-label에 시도명·건수)
    expect(await screen.findByRole("link", { name: /서울특별시/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /부산광역시/ })).toBeInTheDocument();

    // 범례: 상태별 라벨 + 총건수(전체 합계 = 5+2+3 = 10)
    const legend = screen.getByRole("group", { name: /범례/ });
    expect(within(legend).getByText(/검증됨/)).toBeInTheDocument();
    expect(within(legend).getByText(/검증중/)).toBeInTheDocument();
    expect(within(legend).getByText(/미검증/)).toBeInTheDocument();
    expect(within(legend).getByText(/10/)).toBeInTheDocument();

    // 호출 URL 확인(기본 도메인 없음 또는 전체)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/map-stats"));
  });

  it("좌표가 없거나 null인 sido는 핀 누락 없이 '미지정'으로 안전 표기한다", async () => {
    mockMapStats(SAMPLE);
    renderMap();
    await screen.findByRole("link", { name: /서울특별시/ });

    expect(screen.getByText(/미지정/)).toBeInTheDocument();
  });

  it("핀 클릭 시 해당 sido로 /archive?sido= 이동한다", async () => {
    mockMapStats(SAMPLE);
    const { findByRole } = renderMap();

    const pin = await findByRole("link", { name: /서울특별시/ });
    fireEvent.click(pin);

    expect(await screen.findByTestId("probe")).toHaveTextContent(
      "sido=" + encodeURIComponent("서울특별시"),
    );
  });

  it("도메인 세그먼트 전환 시 ?domain= 으로 재요청한다", async () => {
    mockMapStats(SAMPLE);
    renderMap();
    await screen.findByRole("link", { name: /서울특별시/ });

    const seg = screen.getByRole("group", { name: /도메인 선택/ });
    within(seg).getByRole("button", { name: /선거 의혹/ }).click();

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("domain=election"),
      );
    });
  });
});
