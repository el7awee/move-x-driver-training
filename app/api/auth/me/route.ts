import { currentIdentityResponse } from "@/lib/identity/http";
import {
  clearSessionCookie,
  getCurrentIdentity,
  safeAuthError,
} from "../_shared";

export async function GET(request: Request) {
  try {
    const current = await getCurrentIdentity(request);
    return currentIdentityResponse(current.context, clearSessionCookie());
  } catch (error) {
    return safeAuthError(error);
  }
}
