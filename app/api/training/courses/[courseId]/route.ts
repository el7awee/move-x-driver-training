import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import { validateCoursePolicy, type CourseStatus } from "@/lib/training/core";
import { googleDrivePreviewUrl } from "@/lib/training/video-source";
import { getTrainingStore, parseCourseId, safeTrainingError } from "../../_shared";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const current = await requireReadyRequest(request);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    if (!course) throw new IdentityError(404, "course_not_found", "الدورة غير موجودة.");
    const manager = current.context.user.role !== "driver";
    const access = manager ? null : await store.getDriverAccess(courseId, current.context.user.id);
    if (!manager && (!access || course.status !== "published")) {
      throw new IdentityError(403, "course_not_assigned", "هذه الدورة غير متاحة لك.");
    }
    const unlocked = manager || Number(access?.video_percentage ?? 0) >= course.quizUnlockPercentage;
    return Response.json({
      course,
      videoPreviewUrl: course.videoSourceType === "google_drive" && course.videoSourceRef
        ? googleDrivePreviewUrl(course.videoSourceRef)
        : null,
      videoPercentage: Number(access?.video_percentage ?? 0),
      questions: unlocked
        ? (manager ? await store.getManagerQuestions(courseId) : await store.getPublicQuestions(courseId))
        : [],
      quizUnlocked: unlocked,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeTrainingError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const existing = await store.getCourse(courseId);
    if (!existing) throw new IdentityError(404, "course_not_found", "الدورة غير موجودة.");
    const payload = await request.json() as {
      title?: string;
      description?: string;
      status?: CourseStatus;
      passPercentage?: number;
      maxAttempts?: number | null;
      quizUnlockPercentage?: number;
      showExplanationsAfterSubmission?: boolean;
      passMessage?: string;
      retryMessage?: string;
    };
    const status = payload.status ?? existing.status;
    if (!["draft", "published", "archived"].includes(status)) {
      throw new IdentityError(400, "invalid_course_status", "حالة الدورة غير صالحة.");
    }
    const policy = {
      passPercentage: payload.passPercentage ?? existing.passPercentage,
      maxAttempts: payload.maxAttempts === undefined ? existing.maxAttempts : payload.maxAttempts,
      quizUnlockPercentage: payload.quizUnlockPercentage ?? existing.quizUnlockPercentage,
    };
    validateCoursePolicy(policy);
    if (status === "published") {
      const readiness = await store.courseReadiness(courseId);
      if (!readiness || !Number(readiness.has_video) || Number(readiness.question_count) < 1 || Number(readiness.invalid_questions)) {
        throw new IdentityError(409, "course_not_ready", "لا يمكن نشر دورة دون فيديو وأسئلة مكتملة.");
      }
    }
    const title = payload.title?.trim() ?? existing.title;
    if (!title || title.length > 180) throw new IdentityError(400, "invalid_course", "عنوان الدورة غير صالح.");
    const course = await store.updateCourse(courseId, {
      title,
      description: payload.description?.trim().slice(0, 4000) ?? existing.description,
      status,
      ...policy,
      showExplanationsAfterSubmission: payload.showExplanationsAfterSubmission ?? existing.showExplanationsAfterSubmission,
      passMessage: payload.passMessage?.trim().slice(0, 4000) ?? existing.passMessage,
      retryMessage: payload.retryMessage?.trim().slice(0, 4000) ?? existing.retryMessage,
    });
    return Response.json({ course }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeTrainingError(error);
  }
}
