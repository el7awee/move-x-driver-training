import { requireReadyRequest } from "@/app/api/auth/_shared";
import { getTrainingStore, safeTrainingError } from "../_shared";

export async function GET(request: Request) {
  try {
    await requireReadyRequest(request, ["supervisor", "system_admin"]);
    return Response.json(
      { drivers: await (await getTrainingStore()).listActiveDrivers() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeTrainingError(error);
  }
}
