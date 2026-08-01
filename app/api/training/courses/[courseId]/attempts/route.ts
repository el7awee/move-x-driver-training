import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import { getTrainingStore, parseCourseId, safeTrainingError } from "../../../_shared";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const current = await requireReadyRequest(request, ["driver"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    if (!course || course.status !== "published") {
      throw new IdentityError(404, "course_not_found", "الدورة غير متاحة.");
    }
    const payload = await request.json() as {
      answers?: Array<{ questionId: number; selectedOptionIndex: number }>;
    };
    try {
      const result = await store.submitQuiz(current.context, course, payload.answers ?? []);
      return Response.json({ result }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("assignment unavailable")) {
        throw new IdentityError(403, "course_not_assigned", "هذه الدورة غير مخصصة لك.");
      }
      if (message.includes("unlock threshold")) {
        throw new IdentityError(409, "quiz_locked", "أكمل مشاهدة الفيديو أولًا.");
      }
      if (message.includes("attempt limit")) {
        throw new IdentityError(409, "attempt_limit_reached", "تم استنفاد عدد المحاولات.");
      }
      throw error;
    }
  } catch (error) {
    return safeTrainingError(error);
  }
}
