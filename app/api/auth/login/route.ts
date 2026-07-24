import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, loginAttempts, users } from "@/db/schema";
import {
  createSession,
  normalizeLoginCode,
  requestIp,
  safeAuthError,
  sessionCookie,
  sha256,
  validLoginCode,
  verifyPassword,
} from "../_shared";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { loginCode?: string; password?: string };
    const loginCode = normalizeLoginCode(payload.loginCode ?? "");
    const password = payload.password ?? "";
    if (!validLoginCode(loginCode) || !password) {
      return Response.json({ error: "أدخل كود السائق وكلمة السر." }, { status: 400 });
    }

    const db = await getDb();
    const ipHash = await sha256(requestIp(request));
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const [attemptCount] = await db
      .select({ value: count() })
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.loginCode, loginCode),
        eq(loginAttempts.ipHash, ipHash),
        eq(loginAttempts.succeeded, false),
        gte(loginAttempts.attemptedAt, windowStart),
      ));

    if ((attemptCount?.value ?? 0) >= 5) {
      await db.insert(auditLogs).values({
        action: "auth.login",
        moduleKey: "identity",
        result: "blocked",
        metadataJson: JSON.stringify({ loginCode, reason: "rate_limit" }),
      });
      return Response.json(
        { error: "تم إيقاف المحاولات مؤقتًا. حاول بعد 15 دقيقة أو تواصل مع المشرف." },
        { status: 429 },
      );
    }

    const [user] = await db.select().from(users).where(eq(users.loginCode, loginCode)).limit(1);
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;
    const succeeded = Boolean(user && passwordMatches && user.status !== "suspended");
    await db.insert(loginAttempts).values({ loginCode, ipHash, succeeded });

    if (!succeeded || !user) {
      await db.insert(auditLogs).values({
        actorUserId: user?.id,
        action: "auth.login",
        moduleKey: "identity",
        result: "failure",
        metadataJson: JSON.stringify({ loginCode }),
      });
      return Response.json({ error: "كود المستخدم أو كلمة السر غير صحيحة." }, { status: 401 });
    }

    const session = await createSession(request, user.id);
    await db.update(users).set({
      lastLoginAt: new Date().toISOString(),
      status: user.status === "invited" ? "active" : user.status,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, user.id));
    await db.insert(auditLogs).values({
      actorUserId: user.id,
      action: "auth.login",
      moduleKey: "identity",
      result: "success",
    });

    return Response.json({
      user: {
        displayName: user.displayName,
        loginCode: user.loginCode,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        biometricStatus: "not_enrolled",
      },
    }, {
      headers: { "Set-Cookie": sessionCookie(session.token), "Cache-Control": "no-store" },
    });
  } catch (error) {
    return safeAuthError(error);
  }
}
