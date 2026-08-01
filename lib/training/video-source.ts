import { IdentityError } from "../identity/core.ts";

export const VIDEO_SOURCE_TYPES = ["google_drive", "r2", "youtube", "external_url"] as const;
export type VideoSourceType = typeof VIDEO_SOURCE_TYPES[number];
export type VideoStatus = "awaiting_google_drive_url" | "ready";

const GOOGLE_DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export function extractGoogleDriveFileId(value: string) {
  const input = value.trim();
  if (!input || /[<>]/.test(input) || /^(?:javascript|data):/iu.test(input)) {
    throw new IdentityError(400, "invalid_google_drive_url", "رابط Google Drive غير صالح.");
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new IdentityError(400, "invalid_google_drive_url", "رابط Google Drive غير صالح.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "drive.google.com" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new IdentityError(400, "untrusted_video_host", "يسمح حاليًا بروابط drive.google.com الموثوقة فقط.");
  }

  let fileId = "";
  const fileMatch = url.pathname.match(/^\/file\/d\/([^/]+)\/(?:view|preview)\/?$/u);
  if (fileMatch) fileId = fileMatch[1];
  if (url.pathname === "/open" || url.pathname === "/open/") fileId = url.searchParams.get("id") ?? "";
  if (!GOOGLE_DRIVE_FILE_ID.test(fileId)) {
    throw new IdentityError(400, "invalid_google_drive_url", "تعذر استخراج معرّف ملف Google Drive من الرابط.");
  }
  return fileId;
}

export function googleDrivePreviewUrl(fileId: string) {
  if (!GOOGLE_DRIVE_FILE_ID.test(fileId)) {
    throw new IdentityError(500, "invalid_stored_video", "معرّف فيديو Google Drive المخزن غير صالح.");
  }
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
