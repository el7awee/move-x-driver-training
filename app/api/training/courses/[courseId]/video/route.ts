import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import { stableCourseObjectKey } from "@/lib/training/core";
import {
  MAX_VIDEO_BYTES,
  parseByteRange,
  safeVideoFilename,
  sha256Hex,
} from "@/lib/training/video";
import { getTrainingStore, parseCourseId, safeTrainingError } from "../../../_shared";

type RouteContext = { params: Promise<{ courseId: string }> };

async function getVideosBucket() {
  const { env } = await import("cloudflare:workers");
  if (!env.TRAINING_VIDEOS) {
    throw new IdentityError(503, "video_storage_unavailable", "تخزين الفيديو غير جاهز.");
  }
  return env.TRAINING_VIDEOS;
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    if (!course) throw new IdentityError(404, "course_not_found", "الدورة غير موجودة.");
    if (course.status !== "draft") {
      throw new IdentityError(409, "course_not_draft", "ارفع الفيديو بعد إعادة الدورة إلى مسودة.");
    }
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const declaredSize = Number(request.headers.get("content-length") ?? 0);
    const expectedChecksum = request.headers.get("x-content-sha256")?.trim().toLowerCase() ?? "";
    if (contentType !== "video/mp4") {
      throw new IdentityError(415, "invalid_video_type", "يجب رفع ملف MP4 فقط.");
    }
    if (!Number.isInteger(declaredSize) || declaredSize < 1 || declaredSize > MAX_VIDEO_BYTES) {
      throw new IdentityError(413, "invalid_video_size", "حجم الفيديو غير مسموح.");
    }
    if (!/^[a-f0-9]{64}$/.test(expectedChecksum)) {
      throw new IdentityError(400, "missing_video_checksum", "بصمة SHA-256 مطلوبة.");
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== declaredSize || bytes.byteLength > MAX_VIDEO_BYTES) {
      throw new IdentityError(400, "video_size_mismatch", "حجم الفيديو لا يطابق الطلب.");
    }
    const checksum = await sha256Hex(bytes);
    if (checksum !== expectedChecksum) {
      throw new IdentityError(400, "video_checksum_mismatch", "بصمة الفيديو غير مطابقة.");
    }
    const objectKey = stableCourseObjectKey(courseId, checksum);
    const filename = safeVideoFilename(request.headers.get("x-video-filename"));
    const durationHeader = Number(request.headers.get("x-video-duration-seconds") ?? "");
    const durationSeconds = Number.isFinite(durationHeader) && durationHeader > 0
      ? Math.round(durationHeader)
      : null;
    const codec = request.headers.get("x-video-codec")?.trim().slice(0, 40) || null;
    const bucket = await getVideosBucket();
    if (course.videoChecksum !== checksum) {
      await bucket.put(objectKey, bytes, {
        httpMetadata: { contentType: "video/mp4" },
        customMetadata: { checksum, filename },
      });
    }
    try {
      await store.updateVideoMetadata(courseId, {
        objectKey,
        filename,
        contentType: "video/mp4",
        sizeBytes: bytes.byteLength,
        checksum,
        durationSeconds,
        codec,
      });
    } catch (error) {
      if (course.videoChecksum !== checksum) await bucket.delete(objectKey);
      throw error;
    }
    if (course.videoObjectKey && course.videoObjectKey !== objectKey) {
      await bucket.delete(course.videoObjectKey);
    }
    return Response.json({ ok: true, checksum, sizeBytes: bytes.byteLength });
  } catch (error) {
    return safeTrainingError(error);
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const current = await requireReadyRequest(request);
    const courseId = parseCourseId((await params).courseId);
    const store = await getTrainingStore();
    const course = await store.getCourse(courseId);
    if (!course?.videoObjectKey || !course.videoSizeBytes) {
      throw new IdentityError(404, "video_not_found", "فيديو الدورة غير موجود.");
    }
    if (current.context.user.role === "driver") {
      const access = await store.getDriverAccess(courseId, current.context.user.id);
      if (!access || course.status !== "published") {
        throw new IdentityError(403, "course_not_assigned", "هذه الدورة غير متاحة لك.");
      }
    }
    const range = parseByteRange(request.headers.get("range"), course.videoSizeBytes);
    const object = await (await getVideosBucket()).get(
      course.videoObjectKey,
      range ? { range: { offset: range.start, length: range.length } } : undefined,
    );
    if (!object?.body) throw new IdentityError(404, "video_not_found", "فيديو الدورة غير موجود.");
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Type": "video/mp4",
      "Content-Length": String(range?.length ?? course.videoSizeBytes),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(course.videoFilename ?? "training-video.mp4")}`,
    });
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${course.videoSizeBytes}`);
    }
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    return safeTrainingError(error);
  }
}
