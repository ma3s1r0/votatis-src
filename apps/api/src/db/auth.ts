import { randomBytes, createHash } from "node:crypto";
import { eq, and, gt, isNull } from "drizzle-orm";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import type { Db } from "./repository.js";
import { adminUser, adminInvite, adminSession, loginAttempt } from "./schema.js";

// 설정값 (스펙 결정/근거 기반)
const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72시간
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000; // idle 12h (MVP: 발급 시 만료)
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5분
const RATE_MAX = 10; // 윈도당 10회

export type AdminRole = "root" | "reviewer";

// 고엔트로피 랜덤 토큰(원문) — URL/쿠키에만 노출.
function newToken(): string {
  return randomBytes(32).toString("hex");
}

// 토큰은 단방향 해시로만 DB 저장(원문은 저장 안 함).
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 비밀번호 해시 = argon2id.
export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}

// root 부트스트랩(시드). 이미 존재하면 그대로 반환.
export async function seedRoot(
  db: Db,
  email: string,
  plainPassword: string,
): Promise<typeof adminUser.$inferSelect> {
  const [existing] = await db.select().from(adminUser).where(eq(adminUser.email, email));
  if (existing) return existing;
  const passwordHash = await hashPassword(plainPassword);
  const [row] = await db
    .insert(adminUser)
    .values({ email, role: "root", status: "active", passwordHash })
    .returning();
  return row;
}

// 초대 발급: admin_user(status=invited) + 일회용 토큰 생성. 원문 토큰 반환(저장 안 함).
export async function createInvite(
  db: Db,
  email: string,
  role: AdminRole = "reviewer",
): Promise<{ user: typeof adminUser.$inferSelect; token: string }> {
  return db.transaction(async (tx) => {
    let [user] = await tx.select().from(adminUser).where(eq(adminUser.email, email));
    if (user && user.status === "active") {
      throw new InviteError("already-active");
    }
    if (!user) {
      [user] = await tx
        .insert(adminUser)
        .values({ email, role, status: "invited" })
        .returning();
    }
    const token = newToken();
    await tx.insert(adminInvite).values({
      adminUserId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    return { user, token };
  });
}

export class InviteError extends Error {
  constructor(public reason: "invalid" | "expired" | "used" | "already-active") {
    super(reason);
  }
}

// 초대 수락: 토큰 검증 → 비밀번호 해시 저장 → status=active → 토큰 소비.
export async function acceptInvite(
  db: Db,
  token: string,
  plainPassword: string,
): Promise<typeof adminUser.$inferSelect> {
  const tokenHash = hashToken(token);
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(adminInvite)
      .where(eq(adminInvite.tokenHash, tokenHash));
    if (!invite) throw new InviteError("invalid");
    if (invite.usedAt) throw new InviteError("used");
    if (invite.expiresAt.getTime() <= Date.now()) throw new InviteError("expired");

    const passwordHash = await hashPassword(plainPassword);
    await tx
      .update(adminInvite)
      .set({ usedAt: new Date() })
      .where(eq(adminInvite.id, invite.id));
    const [user] = await tx
      .update(adminUser)
      .set({ status: "active", passwordHash })
      .where(eq(adminUser.id, invite.adminUserId))
      .returning();
    return user;
  });
}

// rate limit: 윈도 내 동일 키 시도 횟수가 임계 이상이면 true(차단).
export async function isRateLimited(db: Db, key: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const rows = await db
    .select()
    .from(loginAttempt)
    .where(and(eq(loginAttempt.key, key), gt(loginAttempt.attemptedAt, since)));
  return rows.length >= RATE_MAX;
}

export async function recordLoginAttempt(db: Db, key: string): Promise<void> {
  await db.insert(loginAttempt).values({ key });
}

// 로그인: email+password 검증. 성공 시 세션 생성, 원문 세션 토큰 반환.
// 실패 사유는 호출자에 노출하지 않음(계정 존재 누설 금지).
export async function login(
  db: Db,
  email: string,
  plainPassword: string,
): Promise<{ user: typeof adminUser.$inferSelect; token: string } | null> {
  const [user] = await db.select().from(adminUser).where(eq(adminUser.email, email));
  if (!user || !user.passwordHash || user.status !== "active") {
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, plainPassword);
  if (!ok) return null;

  const token = newToken();
  await db.insert(adminSession).values({
    adminUserId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_IDLE_MS),
  });
  return { user, token };
}

// 세션 토큰으로 현재 사용자 해석. 폐기/만료/비active 는 null.
export async function resolveSession(
  db: Db,
  token: string,
): Promise<typeof adminUser.$inferSelect | null> {
  const tokenHash = hashToken(token);
  const [session] = await db
    .select()
    .from(adminSession)
    .where(
      and(
        eq(adminSession.tokenHash, tokenHash),
        isNull(adminSession.revokedAt),
        gt(adminSession.expiresAt, new Date()),
      ),
    );
  if (!session) return null;
  const [user] = await db
    .select()
    .from(adminUser)
    .where(eq(adminUser.id, session.adminUserId));
  return user ?? null;
}

// 로그아웃: 세션 폐기.
export async function revokeSession(db: Db, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db
    .update(adminSession)
    .set({ revokedAt: new Date() })
    .where(eq(adminSession.tokenHash, tokenHash));
}
