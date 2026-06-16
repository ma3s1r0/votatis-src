import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";
import * as exif from "./exif";

// QA 회귀(0015 결정 3): EXIF 파싱 실패/미보유 → fail-open(warn).
// 차단하지 않고 경고(⚠ EXIF) 표시 후 파일은 정상 첨부되어야 한다(거짓양성 최소화).
function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

function electionsResponse() {
  return new Response(JSON.stringify({ items: [] }), { status: 200 });
}

describe("ReportForm EXIF warn 폴백(0015 결정 3)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("warn(파싱 실패)이면 차단하지 않고 ⚠EXIF 경고와 함께 파일을 첨부한다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({ kind: "warn" });
    renderWizard();

    const f = new File(["x"], "p.webp", { type: "image/webp" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), f);

    // 파일은 첨부 목록에 추가됨(파일명 표시) + 경고 배지(⚠ EXIF) + 차단 화면 없음
    expect(await screen.findByText("p.webp")).toBeInTheDocument();
    expect(screen.getByText(/⚠ EXIF/)).toBeInTheDocument();
    expect(screen.queryByText(/원본 사진이 아닙니다/)).not.toBeInTheDocument();
  });
});
