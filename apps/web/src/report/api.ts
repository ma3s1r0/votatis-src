// 공개 제보 API 클라이언트. 서버 계약은 specs 0002 참고. 동일 오리진.

const base = "/api";

export type ReportInput = {
  title: string;
  body?: string;
  sido?: string;
  sigungu?: string;
  eupMyeonDong?: string;
  occurredAt?: string;
  domain?: string;
  category?: string;
  electionId?: string;
  consent?: boolean;
  license?: string;
  sources?: string[];
  website?: string; // honeypot
};

export type FieldError = { field: string; reason: string };

export type CreateReportResult =
  | { ok: true; id: string; status: string; trackingNumber?: string }
  | { ok: false; error: "validation_error"; fields: FieldError[] }
  | { ok: false; error: "rate_limited" }
  | { ok: false; error: "unknown" };

export async function createReport(
  input: ReportInput,
): Promise<CreateReportResult> {
  const res = await fetch(`${base}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 201) {
    const data = (await res.json()) as {
      id: string;
      status: string;
      trackingNumber?: string;
    };
    return {
      ok: true,
      id: data.id,
      status: data.status,
      trackingNumber: data.trackingNumber,
    };
  }
  if (res.status === 400) {
    const data = (await res.json()) as {
      error: string;
      fields?: Record<string, string> | FieldError[];
    };
    return {
      ok: false,
      error: "validation_error",
      fields: normalizeFields(data.fields),
    };
  }
  if (res.status === 429) return { ok: false, error: "rate_limited" };
  return { ok: false, error: "unknown" };
}

function normalizeFields(
  fields: Record<string, string> | FieldError[] | undefined,
): FieldError[] {
  if (!fields) return [];
  if (Array.isArray(fields)) return fields;
  return Object.entries(fields).map(([field, reason]) => ({ field, reason }));
}

// ── 첨부 (0002 2단계 presigned) ─────────────────────────────────────────

export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return "이미지(JPEG/PNG/WEBP) 또는 PDF만 첨부할 수 있습니다";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "파일 크기는 10MB를 넘을 수 없습니다";
  }
  return null;
}

type CreateAttachmentResponse = {
  attachmentId: string;
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  expiresInSeconds: number;
};

export type UploadResult =
  | { ok: true }
  | { ok: false; error: string };

// report 생성 후 그 id 로 create → PUT(presigned) → finalize 순서 호출.
export async function uploadAttachment(
  reportId: string,
  file: File,
): Promise<UploadResult> {
  const createRes = await fetch(
    `${base}/reports/${encodeURIComponent(reportId)}/attachments/create`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        // 서버 계약 필드명은 mime (contentType 아님) — 불일치 시 400 unsupported_media_type.
        mime: file.type,
        size: file.size,
      }),
    },
  );
  if (createRes.status === 413) {
    return { ok: false, error: "파일 크기가 서버 허용치를 초과했습니다" };
  }
  if (createRes.status !== 201) {
    return { ok: false, error: "첨부 준비에 실패했습니다" };
  }
  const created = (await createRes.json()) as CreateAttachmentResponse;

  const putRes = await fetch(created.uploadUrl, {
    method: "PUT",
    body: file,
  });
  if (!putRes.ok) {
    return { ok: false, error: "파일 업로드에 실패했습니다" };
  }

  const finalizeRes = await fetch(
    `${base}/reports/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(created.attachmentId)}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (finalizeRes.status === 409) {
    return { ok: false, error: "이미 처리된 첨부입니다" };
  }
  if (!finalizeRes.ok) {
    return { ok: false, error: "첨부 확정에 실패했습니다" };
  }
  return { ok: true };
}
