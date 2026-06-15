import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";
import * as exif from "./exif";

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

describe("ReportWizard EXIF 차단(0015)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("EXIF 없는 이미지를 선택하면 차단 화면이 뜨고 파일은 첨부되지 않는다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({
      kind: "blocked",
      reason: "not_original",
    });
    renderWizard();
    await gotoAttachStep();

    const shot = new File(["x"], "screenshot.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), shot);

    expect(await screen.findByText(/원본 사진이 아닙니다/)).toBeInTheDocument();
    // EXIF 설명 + 직접 촬영 안내 + 다른 파일 선택 액션
    expect(screen.getByText(/EXIF/)).toBeInTheDocument();
    expect(screen.getByText(/직접 촬영한 원본/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /다른 파일 선택/ }),
    ).toBeInTheDocument();
    // 파일이 첨부 목록에 추가되지 않음
    expect(screen.queryByText(/선택된 파일/)).not.toBeInTheDocument();
  });

  it("EXIF 없는 이미지 차단 시 제출해도 attachments/create 가 호출되지 않는다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({
      kind: "blocked",
      reason: "not_original",
    });
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_1", status: "received" }), {
        status: 201,
      }),
    );

    renderWizard();
    await gotoAttachStep();
    const shot = new File(["x"], "screenshot.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), shot);
    await screen.findByText(/원본 사진이 아닙니다/);

    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => c[0] !== "/api/elections");
      expect(calls.length).toBeGreaterThan(0);
    });
    const createCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/attachments/create"),
    );
    expect(createCall).toBeUndefined();
  });

  it("MIME 불일치도 차단된다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({
      kind: "blocked",
      reason: "mime_mismatch",
    });
    renderWizard();
    await gotoAttachStep();
    const fake = new File(["%PDF-1.4"], "fake.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), fake);
    expect(
      await screen.findByText(/파일 형식이 확장자와 일치하지 않습니다/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/선택된 파일/)).not.toBeInTheDocument();
  });

  it("EXIF 있는 원본 이미지는 정상 첨부된다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({ kind: "ok" });
    renderWizard();
    await gotoAttachStep();
    const good = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    expect(await screen.findByText(/선택된 파일: photo.jpg/)).toBeInTheDocument();
    expect(screen.queryByText(/원본 사진이 아닙니다/)).not.toBeInTheDocument();
  });

  it("차단 후 다른 유효 파일을 선택하면 정상 첨부된다", async () => {
    const spy = vi.spyOn(exif, "inspectAttachment");
    spy.mockResolvedValueOnce({ kind: "blocked", reason: "not_original" });
    renderWizard();
    await gotoAttachStep();

    const shot = new File(["x"], "screenshot.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), shot);
    await screen.findByText(/원본 사진이 아닙니다/);

    spy.mockResolvedValueOnce({ kind: "ok" });
    const good = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    expect(await screen.findByText(/선택된 파일: photo.jpg/)).toBeInTheDocument();
    expect(screen.queryByText(/원본 사진이 아닙니다/)).not.toBeInTheDocument();
  });
});
