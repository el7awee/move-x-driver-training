import { requireReadyRequest } from "@/app/api/auth/_shared";
import { getTrainingStore, safeTrainingError } from "../_shared";
import { IdentityError } from "@/lib/identity/core";
import { validateCoursePolicy } from "@/lib/training/core";

export async function GET(request: Request) {
  try {
    const current = await requireReadyRequest(request);
    return Response.json(
      { courses: await (await getTrainingStore()).listCourses(current.context) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeTrainingError(error);
  }
}

export async function POST(request: Request) {
  try {
    const current = await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const payload = await request.json() as {
      slug?: string;
      title?: string;
      description?: string;
      passPercentage?: number;
      maxAttempts?: number | null;
      quizUnlockPercentage?: number;
      showExplanationsAfterSubmission?: boolean;
      passMessage?: string;
      retryMessage?: string;
    };
    const slug = payload.slug?.trim().toLowerCase() ?? "";
    const title = payload.title?.trim() ?? "";
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug) || !title || title.length > 180) {
      throw new IdentityError(400, "invalid_course", "أدخل عنوانًا وslug صالحين للدورة.");
    }
    const policy = {
      passPercentage: payload.passPercentage ?? 80,
      maxAttempts: payload.maxAttempts ?? null,
      quizUnlockPercentage: payload.quizUnlockPercentage ?? 80,
    };
    validateCoursePolicy(policy);
    const course = await (await getTrainingStore()).createCourse({
      slug,
      title,
      description: payload.description?.trim().slice(0, 4000) ?? "",
      ...policy,
      showExplanationsAfterSubmission: payload.showExplanationsAfterSubmission !== false,
      passMessage: payload.passMessage?.trim().slice(0, 4000) ?? "",
      retryMessage: payload.retryMessage?.trim().slice(0, 4000) ?? "",
      createdByUserId: current.context.user.id,
    });
    return Response.json({ course }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeTrainingError(error);
  }
}
