import {
  toPublicIdentityUser,
  type SessionContext,
} from "./core.ts";

export function currentIdentityResponse(
  context: SessionContext | null,
  clearedSessionCookie: string,
) {
  if (!context) {
    return Response.json(
      { error: "انتهت الجلسة. سجل الدخول مرة أخرى.", code: "unauthenticated" },
      {
        status: 401,
        headers: {
          "Set-Cookie": clearedSessionCookie,
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return Response.json(
    { user: toPublicIdentityUser(context) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
