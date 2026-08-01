import { getD1 } from "@/db";
import { D1TrainingStore } from "@/db/training-store";
import { IdentityError } from "@/lib/identity/core";
import { safeAuthError } from "@/app/api/auth/_shared";

export function parseCourseId(value: string) {
  const courseId = Number(value);
  if (!Number.isInteger(courseId) || courseId < 1) {
    throw new IdentityError(400, "invalid_course", "معرّف الدورة غير صالح.");
  }
  return courseId;
}

export async function getTrainingStore() {
  return new D1TrainingStore(await getD1());
}

export function safeTrainingError(error: unknown) {
  if (error instanceof IdentityError) return safeAuthError(error);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json(
      { error: "توجد دورة أو عملية بنفس البيانات.", code: "training_conflict" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (message.includes("no such table") || message.includes("D1 binding")) {
    return Response.json(
      { error: "خدمة التدريب غير جاهزة حاليًا.", code: "training_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { error: "تعذر إتمام عملية التدريب.", code: "training_error" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
