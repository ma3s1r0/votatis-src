// 공개 아카이브 API 클라이언트. 서버 계약은 specs/completed/0002-report-intake-api.md(공개 조회) 참고.
// 공개 조회는 verified=true 만 서버가 보장한다(0002 결정 2). 프런트는 받은 응답만 신뢰한다.
// 비로그인 공개 열람 → credentials 불필요.

const base = "/api/reports";

export type ArchiveItem = {
  id: string;
  title: string;
  body: string | null;
  sido: string | null;
  sigungu: string | null;
  eupMyeonDong: string | null;
  occurredAt: string | null;
  collectedAt: string;
  category: string | null;
  electionId: string | null;
};

export type ArchiveListResponse = {
  items: ArchiveItem[];
  total: number;
  limit: number;
  offset: number;
};

export type ArchiveSource = {
  id: string;
  kind: string;
  url: string | null;
  capturedAt: string;
  contentHash: string;
  archiveUrl: string | null;
};

// 다운로드 URL은 공개 계약에 없다(파일명·메타만 노출).
export type ArchiveAttachment = {
  id: string;
  filename: string | null;
  mime: string | null;
  size: number | null;
  sha256: string | null;
};

// 공개 직렬화된 검토 요약. 서버가 민감 내부필드는 제외한 채 전달한다.
// validity/severity는 서버가 문자열 라벨로 전달한다(수치 아님).
export type ArchiveVerificationSummary = {
  verified: boolean;
  validity: string | null;
  severity: string | null;
  method: string | null;
  notes: string | null;
  // 검증 과정에서 확인되지 못한 주장(객관적 한계 표기용).
  unverifiedClaims: string | null;
};

export type ArchiveDetail = {
  id: string;
  title: string;
  body: string | null;
  sido: string | null;
  sigungu: string | null;
  eupMyeonDong: string | null;
  occurredAt: string | null;
  collectedAt: string;
  category: string | null;
  election: { id: string; name: string } | null;
  verification: ArchiveVerificationSummary | null;
  attachments: ArchiveAttachment[];
  sources: ArchiveSource[];
};

export type ArchiveListQuery = {
  limit?: number;
  offset?: number;
  q?: string;
  sido?: string;
  category?: string;
  electionId?: string;
};

export async function fetchArchive(
  query: ArchiveListQuery = {},
): Promise<ArchiveListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit ?? 20));
  params.set("offset", String(query.offset ?? 0));
  if (query.q) params.set("q", query.q);
  if (query.sido) params.set("sido", query.sido);
  if (query.category) params.set("category", query.category);
  if (query.electionId) params.set("electionId", query.electionId);

  const res = await fetch(`${base}?${params.toString()}`);
  if (!res.ok) throw new Error(`archive_fetch_failed:${res.status}`);
  return (await res.json()) as ArchiveListResponse;
}

// 공개 첨부 다운로드(0008): on-demand presigned GET URL 발급 엔드포인트 호출.
// 서버가 verified ∧ stored ∧ 소속 게이트를 강제(미충족 404). 받은 URL 만 사용한다.
export async function requestAttachmentDownloadUrl(
  reportId: string,
  attachmentId: string,
): Promise<string> {
  const res = await fetch(
    `${base}/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
  );
  if (!res.ok) throw new Error(`attachment_download_failed:${res.status}`);
  const json = (await res.json()) as { url: string; expiresInSeconds: number };
  return json.url;
}

export type FetchArchiveDetailResult =
  | { ok: true; report: ArchiveDetail }
  | { ok: false; error: "not_found" | "unknown" };

export async function fetchArchiveDetail(
  id: string,
): Promise<FetchArchiveDetailResult> {
  const res = await fetch(`${base}/${encodeURIComponent(id)}`);
  if (res.ok) {
    return { ok: true, report: (await res.json()) as ArchiveDetail };
  }
  // 미검증/없는 ID → 404(존재 누설 없음). 둘을 구분하지 않는다.
  if (res.status === 404) return { ok: false, error: "not_found" };
  return { ok: false, error: "unknown" };
}
