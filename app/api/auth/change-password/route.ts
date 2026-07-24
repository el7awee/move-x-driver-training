import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { getCurrentSession, hashPassword, safeAuthError, validNewPassword } from "../_shared";

export async function POST(request: Request) {
  try {
    const current = await getCurrentSession(request);
    if (!current) return Response.json({ error: "انتهت الجلسة. سجل الدخول مرة أخرى." }, { status: 401 });

    const payload = await request.json() as { password?: string; confirmation?: string };
    const password = payload.password ?? "";
    if (!validNewPassword(password)) {
      return Response.json({ error: "كلمة السر الجديدة يجب ألا تقل عن 8 خانات." }, { status: 400 });
    }
    if (password !== payload.confirmation) {
      return Response.json({ error: "تأكيد كلمة السر غير مطابق." }, { status: 400 });
    }
    if (password === "12345678") {
      return Response.json({ error: "اختر كلمة سر مختلفة عن كلمة السر المؤقتة." }, { status: 400 });
    }

    const db = await getDb();
    await db.update(users).set({
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, current.user.id));
    await db.insert(auditLogs).values({
      actorUserId: current.user.id,
      action: "auth.password_changed",
      moduleKey: "identity",
      result: "success",
    });
    return Response.json({ ok: true });
  } catch (error) {
    return safeAuthError(error);
  }
}
