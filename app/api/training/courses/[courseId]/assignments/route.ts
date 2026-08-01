import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import { getTrainingStore, parseCourseId, safeTrainingError } from "../../../_shared";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    if (!await store.getCourse(courseId)) {
      throw new IdentityError(404, "course_not_found", "الدورة غير موجودة.");
    }
    return Response.json(
      { assignments: await store.listCourseAssignments(courseId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeTrainingError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const current = await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    if (!course || course.status !== "published") {
      throw new IdentityError(409, "course_not_published", "انشر الدورة قبل تعيينها للسائقين.");
    }
    const payload = await request.json() as { userIds?: number[]; dueAt?: string | null };
    const userIds = [...new Set((payload.userIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];
    if (!userIds.length || userIds.length > 500) {
      throw new IdentityError(400, "invalid_assignments", "اختر سائقًا واحدًا على الأقل.");
    }
    const dueAt = payload.dueAt ? new Date(payload.dueAt).toISOString() : null;
    await store.assignCourse(courseId, userIds, current.context.user.id, dueAt);
    return Response.json({ ok: true, assigned: userIds.length });
  } catch (error) {
    return safeTrainingError(error);
  }
}
