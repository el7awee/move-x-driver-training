import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_RESTORE_ERROR_MESSAGE,
  SESSION_RESTORE_TIMEOUT_MS,
  restoreIdentitySession,
} from "../lib/identity/client-session.ts";

const testUser = {
  displayName: "سائق اختبار",
  loginCode: "TEST_DRIVER",
  email: null,
  phone: null,
  role: "driver",
  mustChangePassword: false,
  preferredLanguage: "ar",
  photoUrl: null,
  biometricStatus: "not_enrolled",
};

function response(status, body = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("session restoration treats 401 as an unauthenticated login state", async () => {
  const result = await restoreIdentitySession({
    fetcher: async () => response(401, { error: "Unauthorized" }),
  });

  assert.deepEqual(result, { status: "unauthenticated" });
});

test("session restoration accepts an authenticated user", async () => {
  const result = await restoreIdentitySession({
    fetcher: async () => response(200, { user: testUser }),
  });

  assert.deepEqual(result, { status: "authenticated", user: testUser });
});

test("a stalled session request times out after exactly eight seconds", async () => {
  let scheduledDelay;
  let runTimeout;
  const fetcher = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });

  const resultPromise = restoreIdentitySession({
    fetcher,
    scheduleTimeout(callback, delay) {
      runTimeout = callback;
      scheduledDelay = delay;
      return 1;
    },
    clearScheduledTimeout() {},
  });

  assert.equal(scheduledDelay, SESSION_RESTORE_TIMEOUT_MS);
  runTimeout();
  assert.deepEqual(await resultPromise, {
    status: "unavailable",
    message: SESSION_RESTORE_ERROR_MESSAGE,
  });
});

test("a network failure produces the independent session error state", async () => {
  const result = await restoreIdentitySession({
    fetcher: async () => {
      throw new TypeError("Network request failed");
    },
  });

  assert.deepEqual(result, {
    status: "unavailable",
    message: SESSION_RESTORE_ERROR_MESSAGE,
  });
});

test("retry performs a new request and can recover into the authenticated state", async () => {
  let requestCount = 0;
  const fetcher = async () => {
    requestCount += 1;
    if (requestCount === 1) throw new TypeError("Network request failed");
    return response(200, { user: testUser });
  };

  const firstResult = await restoreIdentitySession({ fetcher });
  const retryResult = await restoreIdentitySession({ fetcher });

  assert.equal(firstResult.status, "unavailable");
  assert.deepEqual(retryResult, { status: "authenticated", user: testUser });
  assert.equal(requestCount, 2);
});

test("unmount cancellation finishes silently so callers do not update state", async () => {
  const unmountController = new AbortController();
  const fetcher = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });

  const resultPromise = restoreIdentitySession({
    fetcher,
    signal: unmountController.signal,
  });
  unmountController.abort();

  assert.deepEqual(await resultPromise, { status: "cancelled" });
});

test("login stays usable while session restoration runs and never reloads the browser", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../components/login-form.tsx", import.meta.url), "utf8"),
  );
  assert.match(source, /<form onSubmit=/);
  assert.match(source, /fetch\('\/api\/auth\/me'/);
  assert.doesNotMatch(source, /location\.reload/);
  assert.doesNotMatch(source, /authState === "loading"/);
});
