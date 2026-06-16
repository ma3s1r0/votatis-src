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

function electionsResponse() {
  return new Response(JSON.stringify({ items: [] }), { status: 200 });
}

describe("ReportForm EXIF 차단 전용 화면(0015 / Figma 11)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("EXIF 없는 이미지를 선택하면 차단 전용 화면이 뜨고 파일은 첨부되지 않는다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({
      kind: "blocked",
      reason: "not_original",
    });
    renderWizard();

    const shot = new File(["x"], "screenshot.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), shot);

    expect(await screen.findByText(/원본 사진이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText(/EXIF 정보가 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/EXIF란/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /다시 올리기/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /제보폼으로 돌아가기/ }),
    ).toBeInTheDocument();
    // 파일이 첨부 목록에 추가되지 않음
    expect(screen.queryByText(/screenshot\.png/)).not.toBeInTheDocument();
  });

  it("차단 후 폼으로 돌아가 제출해도 attachments/create 가 호출되지 않는다", async () => {
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
    const shot = new File(["x"], "screenshot.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), shot);
    await screen.findByText(/원본 사진이 아닙니다/);

    await userEvent.click(
      screen.getByRole("button", { name: /제보폼으로 돌아가기/ }),
    );
    await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => c[0] !== "/api/elections");
      expect(calls.length).toBeGreaterThan(0);
    });
    const createCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/attachments/create"),
    );
    expect(createCall).toBeUndefined();
  });

  it("MIME 불일치도 전용 화면으로 차단된다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({
      kind: "blocked",
      reason: "mime_mismatch",
    });
    renderWizard();
    const fake = new File(["%PDF-1.4"], "fake.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), fake);
    expect(
      await screen.findByText(/파일 형식이 확장자와 일치하지 않습니다/),
    ).toBeInTheDocument();
  });

  it("EXIF 있는 원본 이미지는 차단 없이 정상 첨부된다", async () => {
    vi.spyOn(exif, "inspectAttachment").mockResolvedValue({ kind: "ok" });
    renderWizard();
    const good = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
    expect(screen.queryByText(/원본 사진이 아닙니다/)).not.toBeInTheDocument();
  });

  it("차단 화면에서 다른 유효 파일을 올리면 폼으로 돌아가 정상 첨부된다", async () => {
    const spy = vi.spyOn(exif, "inspectAttachment");
    spy.mockResolvedValueOnce({ kind: "blocked", reason: "not_original" });
    renderWizard();

    const shot = new File(["x"], "screenshot.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), shot);
    await screen.findByText(/원본 사진이 아닙니다/);

    spy.mockResolvedValueOnce({ kind: "ok" });
    const good = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
    expect(screen.queryByText(/원본 사진이 아닙니다/)).not.toBeInTheDocument();
  });
});
