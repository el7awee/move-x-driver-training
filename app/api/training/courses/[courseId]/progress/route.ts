import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import { getTrainingStore, parseCourseId, safeTrainingError } from "../../../_shared";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const current = await requireReadyRequest(request, ["driver"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    const access = await store.getDriverAccess(courseId, current.context.user.id);
    if (!course || course.status !== "published" || !access) {
      throw new IdentityError(403, "course_not_assigned", "هذه الدورة غير متاحة لك.");
    }
    const payload = await request.json() as { videoSeconds?: number; videoPercentage?: number };
    const requestedSeconds = Math.max(0, Math.floor(Number(payload.videoSeconds ?? 0)));
    if (!Number.isFinite(requestedSeconds) || !course.videoDurationSeconds) {
      throw new IdentityError(400, "invalid_progress", "بيانات التقدم غير صالحة.");
    }
    const videoSeconds = Math.min(requestedSeconds, course.videoDurationSeconds);
    const videoPercentage = Math.min(100, Math.floor((videoSeconds / course.videoDurationSeconds) * 100));
    await store.updateProgress(courseId, current.context.user.id, videoSeconds, videoPercentage);
    return Response.json({ ok: true, videoSeconds, videoPercentage });
  } catch (error) {
    return safeTrainingError(error);
  }
}
