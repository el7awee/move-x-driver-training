import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import type { ImportedQuestion } from "@/lib/training/core";
import { getTrainingStore, parseCourseId, safeTrainingError } from "../../../_shared";

type RouteContext = { params: Promise<{ courseId: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    if (!course) throw new IdentityError(404, "course_not_found", "الدورة غير موجودة.");
    if (course.status !== "draft") {
      throw new IdentityError(409, "course_not_draft", "عدّل الأسئلة بعد إعادة الدورة إلى مسودة.");
    }
    const payload = await request.json() as { questions?: ImportedQuestion[] };
    const questions = payload.questions ?? [];
    if (!questions.length || questions.length > 100) {
      throw new IdentityError(400, "invalid_questions", "يجب توفير سؤال واحد إلى 100 سؤال.");
    }
    questions.forEach((question, index) => {
      if (
        question.position !== index + 1 ||
        !question.prompt?.trim() ||
        question.options.length < 2 ||
        question.options.length > 8 ||
        question.options.some((option) => !option.trim()) ||
        !Number.isInteger(question.correctOptionIndex) ||
        question.correctOptionIndex < 0 ||
        question.correctOptionIndex >= question.options.length
      ) {
        throw new IdentityError(400, "invalid_questions", `السؤال ${index + 1} غير مكتمل.`);
      }
    });
    await store.replaceQuestions(courseId, questions);
    return Response.json({ ok: true, questionCount: questions.length });
  } catch (error) {
    return safeTrainingError(error);
  }
}
