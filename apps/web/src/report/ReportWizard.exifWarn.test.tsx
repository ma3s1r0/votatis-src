import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";
import * as exif from "./exif";

// QA 회귀(0015 결정 3): EXIF 파싱 실패/미보유 → fail-open(warn).
// 차단하지 않고 경고만 띄운 뒤 파일은 정상 첨부되어야 한다(거짓양성 최소화).
// 기존 위저드 테스트는 warn 의 "차단 안 함 + 경고 노출 + 첨부됨" 결선을 미커버였다.
function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

async function gotoAttachStep() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.selectOptions(screen.getByLabelText("분류"), "투개표");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
}

function electionsResponse() {
  return new Response(JSON.stringify({ items: [] }), { status: 200 });
}

describe("ReportWizard EXIF warn 폴백(0015 결정 3)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("warn(파싱 실패)이면 차단하지 않고 경고를 띄운 뒤 파일을 첨부한다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({ kind: "warn" });
    renderWizard();
    await gotoAttachStep();

    const f = new File(["x"], "p.webp", { type: "image/webp" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), f);

    // 경고 메시지 노출 + 파일은 첨부 목록에 추가됨 + 차단 화면 없음
    expect(
      await screen.findByText(/촬영 정보를 확인하지 못했습니다/),
    ).toBeInTheDocument();
    expect(screen.getByText(/선택된 파일: p.webp/)).toBeInTheDocument();
    expect(screen.queryByText(/원본 사진이 아닙니다/)).not.toBeInTheDocument();
  });
});
