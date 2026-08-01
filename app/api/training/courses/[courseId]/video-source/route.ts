import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import { extractGoogleDriveFileId } from "@/lib/training/video-source";
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
      throw new IdentityError(409, "course_not_draft", "غيّر رابط الفيديو بعد إعادة الدورة إلى مسودة.");
    }
    const payload = await request.json() as { videoSourceType?: string; url?: string };
    if (payload.videoSourceType !== "google_drive") {
      throw new IdentityError(400, "unsupported_video_source", "Google Drive هو مصدر الفيديو التشغيلي الحالي.");
    }
    const fileId = extractGoogleDriveFileId(payload.url ?? "");
    const updated = await store.updateGoogleDriveVideo(courseId, fileId);
    return Response.json({ course: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeTrainingError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    if (!course) throw new IdentityError(404, "course_not_found", "الدورة غير موجودة.");
    if (course.status !== "draft") {
      throw new IdentityError(409, "course_not_draft", "أزل الفيديو بعد إعادة الدورة إلى مسودة.");
    }
    const updated = await store.removeVideoSource(courseId);
    return Response.json({ course: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeTrainingError(error);
  }
}
