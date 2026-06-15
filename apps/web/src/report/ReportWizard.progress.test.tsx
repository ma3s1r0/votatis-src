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

// 첨부 단계(Step4)까지 진입
async function gotoAttachStep() {
  await userEvent.type(screen.getByLabelText("제목"), "관찰한 정황");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.selectOptions(screen.getByLabelText("분류"), "vote_count");
  await userEvent.click(screen.getByRole("button", { name: "다음" }));
  await userEvent.click(screen.getByRole("button", { name: "다음" })); // 지역 skip
}

// 외부에서 resolve 를 제어할 수 있는 deferred Promise.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ReportWizard 진행 상태 표시", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
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
      .mockReturnValueOnce(create.promise) // POST /api/reports
      .mockReturnValueOnce(attachCreate.promise) // attachments/create
      .mockReturnValueOnce(put.promise) // PUT uploadUrl
      .mockReturnValueOnce(finalize.promise); // finalize

    renderWizard();
    await gotoAttachStep();
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    // 1) report 생성 대기 중 — 접수 중 표시 + 제출 버튼 비활성(중복 클릭 방지)
    expect(await screen.findByText(/제보 접수 중/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제출" })).toBeDisabled();

    // report 생성 완료 → 업로드 단계 진입
    create.resolve(
      new Response(JSON.stringify({ id: "rep_1", status: "received" }), {
        status: 201,
      }),
    );

    // 2) 업로드 중 표시
    expect(await screen.findByText(/업로드 중/)).toBeInTheDocument();

    // 첨부 단계 진행
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

    // 3) 첨부 완료 표시 → 최종 완료 화면
    expect(
      await screen.findByText(/photo\.png.*완료|완료.*photo\.png|업로드 완료/),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "제보가 접수되었습니다" }),
    ).toBeInTheDocument();
  });

  it("첨부 업로드 실패 시 해당 파일을 실패로 표시하되 제보는 접수 완료로 처리한다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    // report 생성 성공
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "rep_2", status: "received" }), {
        status: 201,
      }),
    );
    // attachments/create 실패(500)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    renderWizard();
    await gotoAttachStep();
    const good = new File(["imgdata"], "photo.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("사진/PDF 첨부"), good);
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    // 실패 표시
    expect(await screen.findByText(/첨부.*실패|실패/)).toBeInTheDocument();
    // 그래도 접수는 완료
    expect(
      await screen.findByRole("heading", { name: "제보가 접수되었습니다" }),
    ).toBeInTheDocument();
  });

  it("첨부가 없으면 '접수 중'만 거쳐 완료 화면으로 간다", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const create = deferred<Response>();
    fetchMock.mockReturnValueOnce(create.promise);

    renderWizard();
    await gotoAttachStep();
    // 첨부 없이 다음
    await userEvent.click(screen.getByRole("button", { name: "다음" }));
    await userEvent.click(screen.getByLabelText(/동의/));
    await userEvent.click(screen.getByRole("button", { name: "제출" }));

    expect(await screen.findByText(/제보 접수 중/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제출" })).toBeDisabled();

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
