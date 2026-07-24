import { toPublicIdentityUser } from "@/lib/identity/core";
import {
  requestIp,
  requireAuthenticatedRequest,
  safeAuthError,
  sessionCookie,
} from "../_shared";

export async function POST(request: Request) {
  try {
    const current = await requireAuthenticatedRequest(request);
    const payload = await request.json() as { password?: string; confirmation?: string };
    const result = await current.service.changePassword(current.context, {
      password: payload.password ?? "",
      confirmation: payload.confirmation ?? "",
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return Response.json(
      { ok: true, user: toPublicIdentityUser(result.context) },
      {
        headers: {
          "Set-Cookie": sessionCookie(result.token),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return safeAuthError(error);
  }
}
