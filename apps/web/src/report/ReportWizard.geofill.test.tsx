import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";

// extractGps 는 모킹(실제 JPEG GPS 바이트 구성 불필요). inspectAttachment 는 실제 유지.
vi.mock("./exif", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, extractGps: vi.fn().mockResolvedValue({ lat: 37.5, lng: 127.0 }) };
});

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

// /api/elections 는 빈 목록, /api/geocode/reverse 는 시군구 반환.
function routedFetch() {
  return vi.fn(async (url: string) => {
    if (typeof url === "string" && url.includes("/geocode/reverse")) {
      return new Response(
        JSON.stringify({ region: { sido: "서울특별시", sigungu: "강남구" } }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
}

describe("ReportForm 위치 자동입력(0021 EXIF GPS)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", routedFetch());
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("GPS 있는 사진 첨부 시 빈 위치를 시군구로 자동 채운다", async () => {
    renderWizard();
    const img = new File(["x"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), img);

    const loc = screen.getByLabelText("위치") as HTMLInputElement;
    await waitFor(() => expect(loc.value).toBe("서울특별시 강남구"));
    expect(screen.getByText(/사진 위치에서 자동 입력됨/)).toBeInTheDocument();
  });

  it("이미 위치를 입력했으면 자동입력이 덮어쓰지 않는다", async () => {
    renderWizard();
    const loc = screen.getByLabelText("위치");
    await userEvent.type(loc, "부산 해운대구 OO투표소");
    const img = new File(["x"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), img);

    // 잠깐 대기 후에도 사용자가 적은 값 유지
    await new Promise((r) => setTimeout(r, 50));
    expect((loc as HTMLInputElement).value).toBe("부산 해운대구 OO투표소");
  });
});
