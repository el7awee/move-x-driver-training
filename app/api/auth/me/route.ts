import { toPublicIdentityUser } from "@/lib/identity/core";
import {
  clearSessionCookie,
  getCurrentIdentity,
  safeAuthError,
} from "../_shared";

export async function GET(request: Request) {
  try {
    const current = await getCurrentIdentity(request);
    if (!current.context) {
      return Response.json(
        { error: "انتهت الجلسة. سجل الدخول مرة أخرى.", code: "unauthenticated" },
        {
          status: 401,
          headers: {
            "Set-Cookie": clearSessionCookie(),
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return Response.json(
      { user: toPublicIdentityUser(current.context) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeAuthError(error);
  }
}
