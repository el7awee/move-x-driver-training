import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const buildRoot = new URL("../.next/server/", import.meta.url);

test("production build renders the public MOVE X application shell", async () => {
  const html = await readFile(new URL("app/index.html", buildRoot), "utf8");
  assert.match(html, /MOVE X/);
  assert.match(html, /جارٍ التحقق من الجلسة/);
  assert.match(html, /<main class="identity-state-shell">/);
});

test("production build includes login and current-session API routes", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("app-paths-manifest.json", buildRoot), "utf8"),
  );
  assert.equal(manifest["/page"], "app/page.js");
  assert.equal(manifest["/api/auth/login/route"], "app/api/auth/login/route.js");
  assert.equal(manifest["/api/auth/me/route"], "app/api/auth/me/route.js");
  assert.equal(
    manifest["/api/auth/staging-authorization-check/route"],
    "app/api/auth/staging-authorization-check/route.js",
  );
});

test("production build keeps identity preview controls disabled", async () => {
  const html = await readFile(new URL("app/index.html", buildRoot), "utf8");
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.equal(html.includes("معاينة كسائق"), false);
  assert.equal(html.includes("معاينة كمشرف"), false);
  assert.match(
    source,
    /isIdentityPreviewEnabled\(\s*process\.env\.NODE_ENV,\s*process\.env\.NEXT_PUBLIC_ENABLE_IDENTITY_PREVIEW/,
  );
});
