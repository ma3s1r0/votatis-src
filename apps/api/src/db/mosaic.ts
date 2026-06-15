import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./repository.js";
import type { MosaicPort } from "../mosaic.js";
import type { StoragePort } from "../storage.js";
import { report, attachment } from "./schema.js";

// 공표 처리(0016): assembly 제보의 stored 첨부에 대해 MosaicPort 로 공개본을 생성하고
// publicKey 를 기록한다. domain≠assembly 면 no-op(결정 1). publicKey 가 이미 있는
// 첨부는 skip(멱등, 결정 5). 처리 실패 시 publicKey 미설정 → 공개 404 유지(fail-closed).
//
// storage 는 실 구현체에서 공개본 객체 검증 등에 쓰일 수 있어 인터페이스로 받되,
// 본 스펙 구현(FakeMosaic)에서는 MosaicPort 가 생성을 책임진다.
export async function processMosaicForReport(
  db: Db,
  args: { reportId: string; mosaic: MosaicPort; storage: StoragePort },
): Promise<void> {
  const [rep] = await db
    .select({ domain: report.domain })
    .from(report)
    .where(eq(report.id, args.reportId));
  if (!rep || rep.domain !== "assembly") return;

  // stored ∧ publicKey 미설정 첨부만(멱등 — 이미 처리된 건 재생성 안 함).
  const rows = await db
    .select({ id: attachment.id, storageKey: attachment.storageKey })
    .from(attachment)
    .where(
      and(
        eq(attachment.reportId, args.reportId),
        eq(attachment.status, "stored"),
        isNull(attachment.publicKey),
      ),
    );

  for (const row of rows) {
    const { publicKey } = await args.mosaic.process({ originalKey: row.storageKey });
    await db.update(attachment).set({ publicKey }).where(eq(attachment.id, row.id));
  }
}
