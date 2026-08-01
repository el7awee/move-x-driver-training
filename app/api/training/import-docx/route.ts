import { requireReadyRequest } from "@/app/api/auth/_shared";
import { IdentityError } from "@/lib/identity/core";
import { parseQuestionDocx } from "@/lib/training/core";
import { safeTrainingError } from "../_shared";

const MAX_DOCX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireReadyRequest(request, ["supervisor", "system_admin"]);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_DOCX_BYTES) {
      throw new IdentityError(413, "docx_too_large", "ملف Word أكبر من الحد المسموح.");
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_DOCX_BYTES) {
      throw new IdentityError(400, "invalid_docx", "ملف Word فارغ أو أكبر من الحد المسموح.");
    }
    const preview = parseQuestionDocx(bytes);
    return Response.json({ preview }, { status: preview.valid ? 200 : 422 });
  } catch (error) {
    return safeTrainingError(error);
  }
}
