import { createHash } from "node:crypto";
import type { Db } from "./db/repository.js";
import type { InMemoryStorage } from "./storage.js";
import { createElection, createReport, createSource } from "./db/repository.js";
import { createPendingAttachment, finalizeAttachment } from "./db/intake.js";
import { submitVerification, type EvidenceLink } from "./db/verification.js";
import { seedRoot } from "./db/auth.js";

// 결정적 로컬 시드. 부팅마다 동일한 데이터를 만든다(랜덤 없음 — id 만 DB 가 생성).
// 운영 경로(lambda)는 호출하지 않는다. dev-server 전용.

export const SEED_ADMIN_EMAIL = "admin@votatis.local";
export const SEED_ADMIN_PASSWORD = "votatis-dev-1234";

// 고정 시각(결정적). 수집 시점·점유 시점이 부팅마다 흔들리지 않게 한다.
const T = (iso: string) => new Date(iso);

// 결정적 content_hash(무결성 source 요구사항 충족).
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

type SeedReportSpec = {
  title: string;
  body: string;
  sido?: string;
  sigungu?: string;
  category?: string;
  occurredAt?: string;
  withElection?: boolean;
  sources?: { url: string; capturedAt: string }[];
  attachment?: { filename: string; mime: string; size: number };
  verification?: {
    confidence: number;
    validity: string;
    severity: string;
    method: string;
    notes: string;
    unverifiedClaims: string;
    evidence: { url: string; capturedAt: string }[];
  };
};

const REPORTS: SeedReportSpec[] = [
  {
    title: "사전투표함 봉인 훼손 의혹",
    body: "사전투표 종료 후 투표함 봉인 스티커가 훼손된 상태로 발견되었다는 제보.",
    sido: "서울특별시",
    sigungu: "강남구",
    category: "사전투표",
    occurredAt: "2026-05-29T18:00:00.000Z",
    withElection: true,
    sources: [{ url: "https://example.org/news/seal-1", capturedAt: "2026-05-30T01:00:00.000Z" }],
    attachment: { filename: "seal.jpg", mime: "image/jpeg", size: 204800 },
    verification: {
      confidence: 72,
      validity: "partly",
      severity: "3",
      method: "현장 사진 메타데이터 대조 및 관할 선관위 공지 확인",
      notes: "봉인 훼손은 사실로 확인되나 고의 정황은 확인되지 않음.",
      unverifiedClaims: "외부인 개입 주장은 근거 미확보.",
      evidence: [
        { url: "https://example.org/evidence/seal-photo", capturedAt: "2026-05-30T02:00:00.000Z" },
        { url: "https://nec.go.kr/notice/seal", capturedAt: "2026-05-30T03:00:00.000Z" },
      ],
    },
  },
  {
    title: "전산 집계 수치 불일치 신고",
    body: "개표 방송 중계 수치와 선관위 공표 수치가 일시적으로 불일치했다는 제보.",
    sido: "경기도",
    sigungu: "수원시",
    category: "전산집계",
    occurredAt: "2026-06-01T13:30:00.000Z",
    withElection: true,
    sources: [{ url: "https://example.org/news/tally-1", capturedAt: "2026-06-01T14:00:00.000Z" }],
    verification: {
      confidence: 90,
      validity: "invalid",
      severity: "2",
      method: "방송 캡처 타임라인과 선관위 잠정/확정 공표본 비교",
      notes: "잠정치 갱신 지연으로 인한 표시 차이로 확인. 집계 자체 오류 아님.",
      unverifiedClaims: "조작 주장은 근거 없음.",
      evidence: [
        { url: "https://example.org/evidence/tally-diff", capturedAt: "2026-06-01T15:00:00.000Z" },
      ],
    },
  },
  {
    title: "개표 참관인 퇴거 요구 논란",
    body: "정당 추천 참관인이 정당한 사유 없이 퇴거를 요구받았다는 제보.",
    sido: "부산광역시",
    sigungu: "해운대구",
    category: "개표참관",
    occurredAt: "2026-06-01T22:10:00.000Z",
    withElection: true,
    sources: [{ url: "https://example.org/news/observer-1", capturedAt: "2026-06-02T00:00:00.000Z" }],
    attachment: { filename: "observer-log.pdf", mime: "application/pdf", size: 51200 },
    verification: {
      confidence: 65,
      validity: "unclear",
      severity: "3",
      method: "참관인 진술서와 개표소 운영일지 대조",
      notes: "퇴거 요구 사실은 확인되나 사유의 정당성은 판단 보류.",
      unverifiedClaims: "관리관의 위법 지시 주장은 미확인.",
      evidence: [
        { url: "https://example.org/evidence/observer-statement", capturedAt: "2026-06-02T01:00:00.000Z" },
      ],
    },
  },
  {
    title: "선거인명부 중복 등재 의혹",
    body: "동일 주민의 명부 중복 등재 가능성이 제기된 제보.",
    sido: "대구광역시",
    category: "명부·선거인",
    occurredAt: "2026-05-28T09:00:00.000Z",
    sources: [{ url: "https://example.org/news/roll-1", capturedAt: "2026-05-28T10:00:00.000Z" }],
    verification: {
      confidence: 88,
      validity: "invalid",
      severity: "1",
      method: "관할 구청 세대 정보 및 명부 대사 결과 확인",
      notes: "동명이인으로 확인. 중복 등재 아님.",
      unverifiedClaims: "조직적 명부 조작 주장은 근거 없음.",
      evidence: [
        { url: "https://example.org/evidence/roll-check", capturedAt: "2026-05-28T11:00:00.000Z" },
      ],
    },
  },
  // ----- 미검증(검토 큐용) -----
  {
    title: "투표지 분류기 오작동 제보",
    body: "투표지 분류기가 특정 후보 표를 무효로 분류했다는 제보. 확인 전.",
    sido: "인천광역시",
    sigungu: "남동구",
    category: "시스템·장비",
    occurredAt: "2026-06-01T21:00:00.000Z",
    withElection: true,
    sources: [{ url: "https://example.org/news/sorter-1", capturedAt: "2026-06-01T21:30:00.000Z" }],
    attachment: { filename: "sorter.png", mime: "image/png", size: 102400 },
  },
  {
    title: "사전투표소 CCTV 미설치 제보",
    body: "일부 사전투표소에 CCTV가 설치되지 않았다는 제보. 사실 확인 필요.",
    sido: "광주광역시",
    category: "사전투표",
    occurredAt: "2026-05-29T10:00:00.000Z",
    sources: [{ url: "https://example.org/news/cctv-1", capturedAt: "2026-05-29T11:00:00.000Z" }],
  },
  {
    title: "개표소 출입 통제 미흡 제보",
    body: "개표소 출입 통제가 느슨해 외부인이 출입했다는 제보. 검토 대기.",
    sido: "대전광역시",
    sigungu: "유성구",
    category: "기타",
    occurredAt: "2026-06-01T20:00:00.000Z",
  },
];

const toEvidence = (
  e: { url: string; capturedAt: string },
): EvidenceLink => ({
  url: e.url,
  capturedAt: T(e.capturedAt),
  contentHash: hash(e.url),
});

export type SeedResult = {
  adminEmail: string;
  adminPassword: string;
  elections: number;
  reportsTotal: number;
  reportsVerified: number;
  reportsPending: number;
};

export async function seed(db: Db, storage: InMemoryStorage): Promise<SeedResult> {
  // 1) 루트 관리자(seedRoot — 멱등).
  const root = await seedRoot(db, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  // 2) 선거.
  const election9 = await createElection(db, {
    name: "제9회 전국동시지방선거",
    type: "지선",
    heldOn: T("2026-06-03T00:00:00.000Z"),
  });
  await createElection(db, {
    name: "2026 상반기 재·보궐선거",
    type: "재보궐",
    heldOn: T("2026-04-08T00:00:00.000Z"),
  });

  let verified = 0;
  let pending = 0;

  // 3) 제보.
  for (const spec of REPORTS) {
    const report = await createReport(db, {
      title: spec.title,
      body: spec.body,
      sido: spec.sido,
      sigungu: spec.sigungu,
      category: spec.category,
      electionId: spec.withElection ? election9.id : undefined,
      occurredAt: spec.occurredAt ? T(spec.occurredAt) : undefined,
      collectedAt: spec.occurredAt ? T(spec.occurredAt) : T("2026-06-02T00:00:00.000Z"),
      status: "submitted",
      consent: true,
      license: "CC-BY-4.0",
    });

    // 원본 출처(제보 주장 근거). verification_id 없음.
    for (const s of spec.sources ?? []) {
      await createSource(db, {
        reportId: report.id,
        kind: "url",
        url: s.url,
        capturedAt: T(s.capturedAt),
        contentHash: hash(s.url),
      });
    }

    // 첨부: pending 생성 → 스토리지에 put → finalize(=stored). 실 업로드 경로 재현.
    if (spec.attachment) {
      const sha256 = hash(`${report.id}:${spec.attachment.filename}`);
      const att = await createPendingAttachment(db, {
        reportId: report.id,
        storageKey: `reports/${report.id}/${spec.attachment.filename}`,
        filename: spec.attachment.filename,
        mime: spec.attachment.mime,
        size: spec.attachment.size,
        expectedSha256: sha256,
      });
      storage.put(att.storageKey, spec.attachment.size, sha256);
      await finalizeAttachment(db, {
        reportId: report.id,
        attachmentId: att.id,
        headObject: (key) => storage.headObject(key),
      });
    }

    // 판정: submitVerification 이 report.v_* 미러링 + 근거 source 보관.
    if (spec.verification) {
      const result = await submitVerification(db, {
        reportId: report.id,
        reviewerId: root.id,
        input: {
          confidence: spec.verification.confidence,
          validity: spec.verification.validity,
          severity: spec.verification.severity,
          verified: true,
          method: spec.verification.method,
          notes: spec.verification.notes,
          unverifiedClaims: spec.verification.unverifiedClaims,
          evidenceLinks: spec.verification.evidence.map(toEvidence),
        },
      });
      if (!result.ok) {
        throw new Error(`seed verification failed: ${JSON.stringify(result)}`);
      }
      verified++;
    } else {
      // 미검증 → v_verified null 유지 → 관리자 검토 큐(isNull)로 노출.
      pending++;
    }
  }

  return {
    adminEmail: SEED_ADMIN_EMAIL,
    adminPassword: SEED_ADMIN_PASSWORD,
    elections: 2,
    reportsTotal: REPORTS.length,
    reportsVerified: verified,
    reportsPending: pending,
  };
}
