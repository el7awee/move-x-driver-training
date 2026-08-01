import { and, count, eq, gte, isNull } from "drizzle-orm";
import type {
  AuditInput,
  BiometricStatus,
  IdentitySession,
  IdentityStore,
  IdentityUser,
  LoginAttemptInput,
  NewSessionInput,
  SessionContext,
} from "@/lib/identity/core";
import type { getDb } from ".";
import {
  auditLogs,
  authSessions,
  biometricEnrollments,
  loginAttempts,
  users,
} from "./schema";

type IdentityDb = Awaited<ReturnType<typeof getDb>>;

export class DrizzleIdentityStore implements IdentityStore {
  constructor(private readonly db: IdentityDb) {}

  async findUserByLoginCode(loginCode: string) {
    const [user] = await this.db.select().from(users)
      .where(eq(users.loginCode, loginCode))
      .limit(1);
    return user ?? null;
  }

  async countRecentFailuresForLoginCode(loginCode: string, since: string) {
    const [row] = await this.db.select({ value: count() }).from(loginAttempts)
      .where(and(
        eq(loginAttempts.loginCode, loginCode),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.attemptedAt, since),
      ));
    return row?.value ?? 0;
  }

  async countRecentFailuresForIp(ipHash: string, since: string) {
    const [row] = await this.db.select({ value: count() }).from(loginAttempts)
      .where(and(
        eq(loginAttempts.ipHash, ipHash),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.attemptedAt, since),
      ));
    return row?.value ?? 0;
  }

  async recordLoginAttempt(input: LoginAttemptInput) {
    await this.db.insert(loginAttempts).values(input);
  }

  async createSession(input: NewSessionInput) {
    const [session] = await this.db.insert(authSessions).values(input).returning();
    if (!session) throw new Error("Session creation failed");
    return session satisfies IdentitySession;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionContext | null> {
    const [row] = await this.db
      .select({ session: authSessions, user: users })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;
    return {
      session: row.session,
      user: row.user satisfies IdentityUser,
      biometricStatus: await this.getBiometricStatus(row.user.id),
    };
  }

  async getBiometricStatus(userId: number): Promise<BiometricStatus> {
    const [row] = await this.db
      .select({ status: biometricEnrollments.status })
      .from(biometricEnrollments)
      .where(eq(biometricEnrollments.userId, userId))
      .limit(1);
    return row?.status ?? "not_enrolled";
  }

  async markSuccessfulLogin(userId: number, at: string) {
    await this.db.update(users).set({
      lastLoginAt: at,
      status: "active",
      updatedAt: at,
    }).where(eq(users.id, userId));
  }

  async updatePassword(userId: number, passwordHash: string, at: string) {
    await this.db.update(users).set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: at,
    }).where(eq(users.id, userId));
  }

  async revokeSession(sessionId: number, at: string) {
    await this.db.update(authSessions).set({ revokedAt: at })
      .where(eq(authSessions.id, sessionId));
  }

  async revokeSessionsForUser(userId: number, at: string) {
    await this.db.update(authSessions).set({ revokedAt: at })
      .where(and(
        eq(authSessions.userId, userId),
        isNull(authSessions.revokedAt),
      ));
  }

  async writeAudit(input: AuditInput) {
    await this.db.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: input.action,
      moduleKey: input.moduleKey,
      result: input.result,
      metadataJson: input.metadataJson,
      createdAt: input.createdAt,
    });
  }
}
