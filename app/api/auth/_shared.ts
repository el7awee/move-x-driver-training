import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { authSessions, users } from "@/db/schema";

export const SESSION_COOKIE = "movex_session";
const PASSWORD_ITERATIONS = 210_000;
const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function normalizeLoginCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function validLoginCode(value: string) {
  return /^[A-Z0-9_-]{3,24}$/.test(value);
}

export function validNewPassword(value: string) {
  return value.length >= 8 && value.length <= 128 && !/^\s+$/.test(value);
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, iterationsValue, saltValue, expectedValue] = encodedHash.split("$");
  if (algorithm !== "pbkdf2-sha256" || !iterationsValue || !saltValue || !expectedValue) return false;
  const iterations = Number(iterationsValue);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;

  const actual = await derivePassword(password, base64ToBytes(saltValue), iterations);
  const expected = base64ToBytes(expectedValue);
  if (actual.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
}

function randomToken() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function createSession(request: Request, userId: number) {
  const db = await getDb();
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const ipHash = await sha256(requestIp(request));
  await db.insert(authSessions).values({
    userId,
    tokenHash,
    ipHash,
    userAgent: request.headers.get("user-agent")?.slice(0, 500),
    expiresAt,
  });
  return { token, expiresAt };
}

export function sessionCookie(token: string, maxAge = 12 * 60 * 60) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const item of cookieHeader.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export async function getCurrentSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const db = await getDb();
  const tokenHash = await sha256(token);
  const [row] = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(
      eq(authSessions.tokenHash, tokenHash),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, new Date().toISOString()),
    ))
    .limit(1);
  return row ?? null;
}

export function safeAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("D1 binding") || message.includes("no such table")) {
    return Response.json(
      { error: "قاعدة بيانات Move X لم تُفعّل بعد. يستطيع المشرف استخدام المعاينة مؤقتًا." },
      { status: 503 },
    );
  }
  return Response.json({ error: "تعذر إتمام العملية الآن. حاول مرة أخرى." }, { status: 500 });
}
