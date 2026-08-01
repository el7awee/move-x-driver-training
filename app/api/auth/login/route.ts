import { toPublicIdentityUser } from "@/lib/identity/core";
import {
  getIdentityService,
  requestIp,
  safeAuthError,
  sessionCookie,
} from "../_shared";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { loginCode?: string; password?: string };
    const service = await getIdentityService();
    const result = await service.login({
      loginCode: payload.loginCode ?? "",
      password: payload.password ?? "",
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    return Response.json(
      { user: toPublicIdentityUser(result.context) },
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
