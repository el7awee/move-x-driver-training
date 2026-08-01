import type { PublicIdentityUser } from "./core";

export const SESSION_RESTORE_TIMEOUT_MS = 8_000;
export const SESSION_RESTORE_ERROR_MESSAGE =
  "تعذر التحقق من الجلسة. تأكد من الاتصال وحاول مرة أخرى.";

export type SessionRestoreResult =
  | { status: "authenticated"; user: PublicIdentityUser }
  | { status: "unauthenticated" }
  | { status: "unavailable"; message: string }
  | { status: "cancelled" };

interface RestoreIdentitySessionOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  scheduleTimeout?: typeof setTimeout;
  clearScheduledTimeout?: typeof clearTimeout;
}

/** Restores the browser session without allowing a stalled request to block the UI forever. */
export async function restoreIdentitySession({
  fetcher = fetch,
  signal,
  timeoutMs = SESSION_RESTORE_TIMEOUT_MS,
  scheduleTimeout = setTimeout,
  clearScheduledTimeout = clearTimeout,
}: RestoreIdentitySessionOptions = {}): Promise<SessionRestoreResult> {
  const controller = new AbortController();
  let timedOut = false;

  const cancelForUnmount = () => controller.abort();
  if (signal?.aborted) {
    return { status: "cancelled" };
  }
  signal?.addEventListener("abort", cancelForUnmount, { once: true });

  const timeout = scheduleTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetcher("/api/auth/me", {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status === 401) {
      return { status: "unauthenticated" };
    }

    const data = await response.json() as {
      user?: PublicIdentityUser;
    };
    if (response.ok && data.user) {
      return { status: "authenticated", user: data.user };
    }

    return { status: "unavailable", message: SESSION_RESTORE_ERROR_MESSAGE };
  } catch {
    if (signal?.aborted && !timedOut) {
      return { status: "cancelled" };
    }
    return { status: "unavailable", message: SESSION_RESTORE_ERROR_MESSAGE };
  } finally {
    clearScheduledTimeout(timeout);
    signal?.removeEventListener("abort", cancelForUnmount);
  }
}
