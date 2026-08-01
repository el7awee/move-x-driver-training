import { IdentityError } from "../identity/core.ts";

export const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

export function parseByteRange(value: string | null, size: number) {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || size < 1) {
    throw new IdentityError(416, "invalid_range", "نطاق الفيديو غير صالح.");
  }
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength < 1) {
      throw new IdentityError(416, "invalid_range", "نطاق الفيديو غير صالح.");
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    throw new IdentityError(416, "invalid_range", "نطاق الفيديو خارج حجم الملف.");
  }
  end = Math.min(end, size - 1);
  return { start, end, length: end - start + 1 };
}

export async function sha256Hex(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function safeVideoFilename(value: string | null) {
  const filename = (value ?? "training-video.mp4")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\\/:"*?<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return filename.toLowerCase().endsWith(".mp4") ? filename : `${filename || "training-video"}.mp4`;
}
