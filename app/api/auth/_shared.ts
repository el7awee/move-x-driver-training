import { getDb } from "@/db";
import { DrizzleIdentityStore } from "@/db/identity-store";
import {
  IdentityError,
  IdentityService,
  requireAllowedRole,
  requireAuthenticatedUser,
  requireReadyUser,
  type IdentityRole,
} from "@/lib/identity/core";

export const SESSION_COOKIE = "__Host-movex_session";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
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

async function getIpHashKey() {
  const { env } = await import("cloudflare:workers");
  const value = env.AUTH_IP_HASH_KEY ?? process.env.AUTH_IP_HASH_KEY;
  if (!value || value.length < 32) {
    throw new Error("AUTH_IP_HASH_KEY is unavailable or shorter than 32 characters");
  }
  return value;
}

export async function getIdentityService() {
  return new IdentityService(
    new DrizzleIdentityStore(await getDb()),
    { ipHashKey: await getIpHashKey() },
  );
}

export async function isStagingValidationEnabled() {
  const { env } = await import("cloudflare:workers");
  return env.IDENTITY_STAGING_VALIDATION === "true";
}

export async function getCurrentIdentity(request: Request) {
  const service = await getIdentityService();
  const context = await service.restoreSession(readCookie(request, SESSION_COOKIE));
  return { service, context };
}

export async function requireAuthenticatedRequest(request: Request) {
  const current = await getCurrentIdentity(request);
  return {
    ...current,
    context: requireAuthenticatedUser(current.context),
  };
}

export async function requireReadyRequest(
  request: Request,
  allowedRoles?: readonly IdentityRole[],
) {
  const current = await getCurrentIdentity(request);
  return {
    ...current,
    context: requireReadyUser(current.context, allowedRoles),
  };
}

export async function requireRoleRequest(
  request: Request,
  allowedRoles: readonly IdentityRole[],
) {
  const current = await requireReadyRequest(request);
  return {
    ...current,
    context: requireAllowedRole(current.context, allowedRoles),
  };
}

export function safeAuthError(error: unknown) {
  if (error instanceof IdentityError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("D1 binding") ||
    message.includes("no such table") ||
    message.includes("AUTH_IP_HASH_KEY")
  ) {
    return Response.json(
      {
        error: "خدمة الهوية غير متاحة حاليًا. حاول مرة أخرى لاحقًا.",
        code: "identity_unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { error: "تعذر إتمام العملية الآن. حاول مرة أخرى.", code: "identity_error" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
