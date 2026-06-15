import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  real,
} from "drizzle-orm/pg-core";

// election — 선거
export const election = pgTable("election", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 지선 | 총선 | 대선 | 재보궐
  type: text("type").notNull(),
  heldOn: timestamp("held_on", { withTimezone: true }),
});

// event — 사건. region 은 컬럼으로 임베드 (확정 결정 1)
export const event = pgTable("event", {
  id: uuid("id").primaryKey().defaultRandom(),
  electionId: uuid("election_id").references(() => election.id),
  sido: text("sido"),
  sigungu: text("sigungu"),
  eupMyeonDong: text("eup_myeon_dong"),
  title: text("title").notNull(),
  summary: text("summary"),
  category: text("category"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
});

// report — 제보. collected_at 필수, verification 필드 예약(nullable)
export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").references(() => event.id),
  // region 임베드
  sido: text("sido"),
  sigungu: text("sigungu"),
  eupMyeonDong: text("eup_myeon_dong"),
  title: text("title").notNull(),
  body: text("body"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  // 무결성: 수집 시점 필수
  collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("submitted"),
  // 익명 제보자 해시
  submitter: text("submitter"),
  consent: boolean("consent"),
  license: text("license"),
  // verification 필드 예약 (값은 0004에서 채움 — nullable)
  vConfidence: real("v_confidence"),
  vValidity: text("v_validity"),
  vSeverity: text("v_severity"),
  vLegalIssue: text("v_legal_issue"),
  vVerified: boolean("v_verified"),
  // 낙관적 버전: 수정 시 증가
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// report_history — 변경 이력 (확정 결정 3). report 수정 시 직전 상태 append
export const reportHistory = pgTable("report_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => report.id),
  version: integer("version").notNull(),
  // 직전 상태 스냅샷
  snapshot: jsonb("snapshot").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// attachment — 첨부 (S3 storage_key + sha256)
export const attachment = pgTable("attachment", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => report.id),
  storageKey: text("storage_key").notNull(),
  sha256: text("sha256").notNull(),
  mime: text("mime"),
  size: integer("size"),
  exif: jsonb("exif"),
});

// admin_user — 관리자 계정. role ∈ {root, reviewer}, status ∈ {invited, active, disabled}
export const adminUser = pgTable("admin_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(), // root | reviewer
  status: text("status").notNull().default("invited"), // invited | active | disabled
  // 비밀번호는 해시로만 저장(평문 금지). accept 전에는 null.
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// admin_invite — 일회용 초대 토큰. 원문은 URL 에만, DB 에는 해시 저장. 만료·소비 기록.
export const adminInvite = pgTable("admin_invite", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => adminUser.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// admin_session — 서버 세션. 세션 ID 는 해시로 저장(쿠키엔 원문). 만료·폐기 기록.
export const adminSession = pgTable("admin_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => adminUser.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// login_attempt — 로그인 rate limit (DB 기반). IP+email 키 윈도 카운팅.
export const loginAttempt = pgTable("login_attempt", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(), // ip|email
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});

// source — 출처/근거. captured_at + content_hash 필수 (무결성)
export const source = pgTable("source", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id").references(() => report.id),
  eventId: uuid("event_id").references(() => event.id),
  // url | text
  kind: text("kind").notNull(),
  url: text("url"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  contentHash: text("content_hash").notNull(),
  archiveUrl: text("archive_url"),
  snapshotRef: text("snapshot_ref"),
});
