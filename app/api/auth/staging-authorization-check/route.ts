import {
  isStagingValidationEnabled,
  requireRoleRequest,
  safeAuthError,
} from "../_shared";

export async function GET(request: Request) {
  try {
    if (!await isStagingValidationEnabled()) {
      return Response.json(
        { error: "Not found", code: "not_found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    const current = await requireRoleRequest(
      request,
      ["supervisor", "system_admin"],
    );
    return Response.json(
      {
        ok: true,
        loginCode: current.context.user.loginCode,
        role: current.context.user.role,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeAuthError(error);
  }
}
