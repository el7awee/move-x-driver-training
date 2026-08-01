import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIdentityService, SESSION_COOKIE } from "@/app/api/auth/_shared";
import type { IdentityRole, SessionContext } from "@/lib/identity/core";
import { canOpenRole, destinationForRole } from "./core";

export async function pageIdentity() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  return (await getIdentityService()).restoreSession(token);
}

export async function requirePageRole(allowed: readonly IdentityRole[]): Promise<SessionContext> {
  const context = await pageIdentity();
  if (!context) redirect("/login");
  if (context.user.mustChangePassword) redirect("/login?password-change=required");
  if (!canOpenRole(context.user.role, allowed)) redirect("/forbidden");
  return context;
}

export async function redirectForCurrentUser() {
  const context = await pageIdentity();
  if (!context || context.user.mustChangePassword) redirect("/login");
  redirect(destinationForRole(context.user.role));
}
