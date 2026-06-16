import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ReportWizard from "./ReportWizard";

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/report"]}>
      <ReportWizard />
    </MemoryRouter>,
  );
}

// 단일 페이지: 제목 입력 + (선택) 첨부.
async function fillTitle() {
  await userEvent.type(screen.getByLabelText("상세 설명"), "관찰한 정황");
}
async function submit() {
  await userEvent.click(screen.getByLabelText(/동의/));
  await userEvent.click(screen.getByRole("button", { name: "제보 제출" }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function electionsResponse() {
  return new Response(JSON.stringify({ items: [] }), { status: 200 });
}

describe("ReportForm 진행 상태 표시", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(electionsResponse()));
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("첨부가 있을 때 제출하면 '접수 중'→'업로드 중'→'완료' 순으로 진행 상태가 표시된다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;

    const create = deferred<Response>();
    const attachCreate = deferred<Response>();
    const put = deferred<Response>();
    const finalize = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(electionsResponse())
      .mockReturnValueOnce(create.promise)
      .mockReturnValueOnce(attachCreate.promise)
      .mockReturnValueOnce(put.promise)
      .mockReturnValueOnce(finalize.promise);

    renderWizard();
    await fillTitle();
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await submit();

    expect(await screen.findByText(/제보 접수 중/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제보 제출" })).toBeDisabled();

    create.resolve(
      new Response(JSON.stringify({ id: "rep_1", status: "received" }), {
        status: 201,
      }),
    );

    expect(await screen.findByText(/업로드 중/)).toBeInTheDocument();

    attachCreate.resolve(
      new Response(
        JSON.stringify({
          attachmentId: "att_1",
          storageKey: "k",
          uploadUrl: "https://s3.example/upload",
          method: "PUT",
          expiresInSeconds: 600,
        }),
        { status: 201 },
      ),
    );
    put.resolve(new Response(null, { status: 200 }));
    finalize.resolve(
      new Response(JSON.stringify({ status: "stored" }), { status: 200 }),
    );

    expect(
      await screen.findByText(/photo\.png.*완료|완료.*photo\.png|업로드 완료/),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "제보가 접수되었습니다" }),
    ).toBeInTheDocument();
  });

  it("첨부 업로드 실패 시 해당 파일을 실패로 표시하되 제보는 접수 완료로 처리한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_2", status: "received" }), {
        status: 201,
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    renderWizard();
    await fillTitle();
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await submit();

    expect(await screen.findByText(/첨부.*실패|실패/)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "제보가 접수되었습니다" }),
    ).toBeInTheDocument();
  });

  it("첨부가 없으면 '접수 중'만 거쳐 완료 화면으로 간다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const create = deferred<Response>();
    fetchMock.mockResolvedValueOnce(electionsResponse());
    fetchMock.mockReturnValueOnce(create.promise);

    renderWizard();
    await fillTitle();
    await submit();

    expect(await screen.findByText(/제보 접수 중/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제보 제출" })).toBeDisabled();

    create.resolve(
      new Response(JSON.stringify({ id: "rep_3", status: "received" }), {
        status: 201,
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "제보가 접수되었습니다" }),
    ).toBeInTheDocument();
  });
});
