import { and, asc, eq, inArray } from "drizzle-orm";
import { attachment } from "./schema.js";
import type { Db } from "./repository.js";

// 리스트(검수 큐·공개 아카이브) 썸네일용: report 별 "첫 stored 이미지 첨부" 키를 일괄 조회.
// gate=true(공개)면 0016 모자이크 게이트 적용 — assembly 는 publicKey(공개본)만, 없으면 제외
// (원본 storage_key 절대 미노출). gate=false(검수)면 원본 storageKey(검토 목적).
export async function firstImageThumbKeys(
  db: Db,
  reports: { id: string; domain: string | null }[],
  opts: { gate: boolean },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = reports.map((r) => r.id);
  if (ids.length === 0) return out;
  const domainById = new Map(reports.map((r) => [r.id, r.domain]));

  const rows = await db
    .select({
      reportId: attachment.reportId,
      storageKey: attachment.storageKey,
      publicKey: attachment.publicKey,
      mime: attachment.mime,
    })
    .from(attachment)
    .where(
      and(inArray(attachment.reportId, ids), eq(attachment.status, "stored")),
    )
    .orderBy(asc(attachment.createdAt));

  for (const r of rows) {
    if (!r.mime?.startsWith("image/")) continue;
    if (out.has(r.reportId)) continue; // 최초(가장 이른) 이미지만
    const key =
      opts.gate && domainById.get(r.reportId) === "assembly"
        ? r.publicKey
        : r.storageKey;
    if (key) out.set(r.reportId, key);
  }
  return out;
}
