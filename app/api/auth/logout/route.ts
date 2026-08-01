import {
  clearSessionCookie,
  getCurrentIdentity,
  safeAuthError,
} from "../_shared";

export async function POST(request: Request) {
  try {
    const current = await getCurrentIdentity(request);
    if (current.context) {
      await current.service.logout(current.context);
    }
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = safeAuthError(error);
    response.headers.set("Set-Cookie", clearSessionCookie());
    return response;
  }
}
