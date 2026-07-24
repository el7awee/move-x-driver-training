import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, authSessions } from "@/db/schema";
import { clearSessionCookie, getCurrentSession, safeAuthError } from "../_shared";

export async function POST(request: Request) {
  try {
    const current = await getCurrentSession(request);
    if (current) {
      const db = await getDb();
      await db.update(authSessions).set({ revokedAt: new Date().toISOString() })
        .where(eq(authSessions.id, current.session.id));
      await db.insert(auditLogs).values({
        actorUserId: current.user.id,
        action: "auth.logout",
        moduleKey: "identity",
        result: "success",
      });
    }
    return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
  } catch (error) {
    return safeAuthError(error);
  }
}
