import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  IdentityError,
  IdentityService,
  TEMPORARY_INITIAL_PASSWORD,
  enforcePasswordChanged,
  hashPassword,
  isIdentityPreviewEnabled,
  keyedIpHash,
  normalizeLoginCode,
  requireAllowedRole,
  requireReadyUser,
  sha256,
  toPublicIdentityUser,
  validLoginCode,
  verifyPassword,
} from "../lib/identity/core.ts";
import { buildBootstrapSql } from "../scripts/bootstrap-identity.ts";

const NOW = new Date("2026-07-24T03:00:00.000Z");
const IP_HASH_KEY = "test-only-key-material-that-is-at-least-32-characters";

class FakeIdentityStore {
  constructor(users = []) {
    this.users = new Map(users.map((user) => [user.loginCode, { ...user }]));
    this.attempts = [];
    this.sessions = [];
    this.audits = [];
    this.biometricStatuses = new Map();
    this.nextSessionId = 1;
  }

  async findUserByLoginCode(loginCode) {
    return this.users.get(loginCode) ?? null;
  }

  async countRecentFailuresForLoginCode(loginCode, since) {
    return this.attempts.filter((attempt) =>
      attempt.loginCode === loginCode &&
      !attempt.succeeded &&
      attempt.attemptedAt >= since
    ).length;
  }

  async countRecentFailuresForIp(ipHash, since) {
    return this.attempts.filter((attempt) =>
      attempt.ipHash === ipHash &&
      !attempt.succeeded &&
      attempt.attemptedAt >= since
    ).length;
  }

  async recordLoginAttempt(input) {
    this.attempts.push({ ...input });
  }

  async createSession(input) {
    const session = {
      id: this.nextSessionId++,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessions.push(session);
    return session;
  }

  async findSessionByTokenHash(tokenHash) {
    const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);
    if (!session) return null;
    const user = [...this.users.values()].find((candidate) => candidate.id === session.userId);
    if (!user) return null;
    return {
      session,
      user,
      biometricStatus: await this.getBiometricStatus(user.id),
    };
  }

  async getBiometricStatus(userId) {
    return this.biometricStatuses.get(userId) ?? "not_enrolled";
  }

  async markSuccessfulLogin(userId, at) {
    const user = [...this.users.values()].find((candidate) => candidate.id === userId);
    if (user) {
      user.status = "active";
      user.lastLoginAt = at;
    }
  }

  async updatePassword(userId, passwordHash) {
    const user = [...this.users.values()].find((candidate) => candidate.id === userId);
    if (user) {
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
    }
  }

  async revokeSession(sessionId, at) {
    const session = this.sessions.find((candidate) => candidate.id === sessionId);
    if (session) session.revokedAt = at;
  }

  async revokeSessionsForUser(userId, at) {
    for (const session of this.sessions) {
      if (session.userId === userId && !session.revokedAt) session.revokedAt = at;
    }
  }

  async writeAudit(input) {
    this.audits.push({ ...input });
  }
}

async function createUser(overrides = {}) {
  return {
    id: 1,
    loginCode: "TR004",
    displayName: "Test Driver",
    email: "test@example.invalid",
    phone: null,
    role: "driver",
    passwordHash: await hashPassword("A-safe-test-password"),
    mustChangePassword: false,
    status: "active",
    preferredLanguage: "ar",
    photoObjectKey: null,
    ...overrides,
  };
}

function createService(store, now = () => NOW) {
  return new IdentityService(store, { ipHashKey: IP_HASH_KEY, now });
}

async function expectIdentityError(action, expectedStatus, expectedCode) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof IdentityError);
    assert.equal(error.status, expectedStatus);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

test("normalizes and validates login codes", () => {
  assert.equal(normalizeLoginCode(" tr 004 \n"), "TR004");
  assert.equal(normalizeLoginCode(" sup_01 "), "SUP_01");
  assert.equal(validLoginCode("TR004"), true);
  assert.equal(validLoginCode("AB"), false);
  assert.equal(validLoginCode("driver@example.com"), false);
});

test("hashes and verifies passwords without retaining plaintext", async () => {
  const hash = await hashPassword("A-safe-test-password");
  assert.match(hash, /^pbkdf2-sha256\$/);
  assert.equal(hash.includes("A-safe-test-password"), false);
  assert.equal(await verifyPassword("A-safe-test-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(await verifyPassword("anything", "malformed"), false);
});

test("returns the same invalid-login response for unknown and existing codes", async () => {
  const user = await createUser();
  const store = new FakeIdentityStore([user]);
  const service = createService(store);
  const attempts = [
    () => service.login({
      loginCode: "UNKNOWN",
      password: "wrong-password",
      ipAddress: "192.0.2.10",
    }),
    () => service.login({
      loginCode: user.loginCode,
      password: "wrong-password",
      ipAddress: "192.0.2.11",
    }),
  ];
  for (const attempt of attempts) {
    await expectIdentityError(attempt, 401, "invalid_credentials");
  }
  assert.equal(store.attempts.length, 2);
  assert.equal(store.audits.every((entry) => !entry.metadataJson?.includes("TR004")), true);
});

test("rate limits repeated failures for one account", async () => {
  const user = await createUser();
  const store = new FakeIdentityStore([user]);
  for (let index = 0; index < 5; index += 1) {
    store.attempts.push({
      loginCode: user.loginCode,
      ipHash: `different-ip-${index}`,
      succeeded: false,
      attemptedAt: NOW.toISOString(),
    });
  }
  await expectIdentityError(
    () => createService(store).login({
      loginCode: user.loginCode,
      password: "A-safe-test-password",
      ipAddress: "192.0.2.20",
    }),
    429,
    "rate_limited",
  );
});

test("rate limits repeated failures from one IP across accounts", async () => {
  const user = await createUser();
  const store = new FakeIdentityStore([user]);
  const ipHash = await keyedIpHash("192.0.2.30", IP_HASH_KEY);
  for (let index = 0; index < 20; index += 1) {
    store.attempts.push({
      loginCode: `USER${index}`,
      ipHash,
      succeeded: false,
      attemptedAt: NOW.toISOString(),
    });
  }
  await expectIdentityError(
    () => createService(store).login({
      loginCode: user.loginCode,
      password: "A-safe-test-password",
      ipAddress: "192.0.2.30",
    }),
    429,
    "rate_limited",
  );
});

test("creates and restores a hashed-token session", async () => {
  const user = await createUser();
  const store = new FakeIdentityStore([user]);
  const service = createService(store);
  const login = await service.login({
    loginCode: "tr004",
    password: "A-safe-test-password",
    ipAddress: "192.0.2.40",
    userAgent: "identity-test",
  });
  assert.notEqual(store.sessions[0].tokenHash, login.token);
  assert.equal(store.sessions[0].tokenHash, await sha256(login.token));
  const restored = await service.restoreSession(login.token);
  assert.equal(restored?.user.loginCode, user.loginCode);
});

test("expires and revokes sessions", async () => {
  const user = await createUser();
  const store = new FakeIdentityStore([user]);
  let currentTime = NOW;
  const service = createService(store, () => currentTime);
  const login = await service.login({
    loginCode: user.loginCode,
    password: "A-safe-test-password",
    ipAddress: "192.0.2.50",
  });
  currentTime = new Date("2026-07-25T00:00:00.000Z");
  assert.equal(await service.restoreSession(login.token), null);
  assert.ok(store.sessions[0].revokedAt);

  currentTime = NOW;
  const secondLogin = await service.login({
    loginCode: user.loginCode,
    password: "A-safe-test-password",
    ipAddress: "192.0.2.51",
  });
  await service.logout(secondLogin.context);
  assert.equal(await service.restoreSession(secondLogin.token), null);
});

test("forces password replacement, revokes old sessions, and issues a fresh session", async () => {
  const user = await createUser({ mustChangePassword: true });
  const store = new FakeIdentityStore([user]);
  const service = createService(store);
  const login = await service.login({
    loginCode: user.loginCode,
    password: "A-safe-test-password",
    ipAddress: "192.0.2.60",
  });
  assert.throws(() => enforcePasswordChanged(login.context), (error) =>
    error instanceof IdentityError && error.code === "password_change_required"
  );
  await expectIdentityError(
    () => service.changePassword(login.context, {
      password: TEMPORARY_INITIAL_PASSWORD,
      confirmation: TEMPORARY_INITIAL_PASSWORD,
      ipAddress: "192.0.2.60",
    }),
    400,
    "temporary_password_reuse",
  );

  const changed = await service.changePassword(login.context, {
    password: "A-new-safe-password",
    confirmation: "A-new-safe-password",
    ipAddress: "192.0.2.60",
  });
  assert.notEqual(changed.token, login.token);
  assert.equal(await service.restoreSession(login.token), null);
  assert.equal((await service.restoreSession(changed.token))?.user.mustChangePassword, false);
  assert.equal(await verifyPassword("A-new-safe-password", store.users.get(user.loginCode).passwordHash), true);
});

test("rejects the temporary credential as a new password for every role", async () => {
  for (const [index, role] of ["driver", "supervisor", "system_admin"].entries()) {
    const user = await createUser({
      id: index + 1,
      loginCode: `ROLE${index + 1}`,
      role,
      mustChangePassword: true,
    });
    const store = new FakeIdentityStore([user]);
    const service = createService(store);
    const login = await service.login({
      loginCode: user.loginCode,
      password: "A-safe-test-password",
      ipAddress: `192.0.2.${70 + index}`,
    });
    await expectIdentityError(
      () => service.changePassword(login.context, {
        password: TEMPORARY_INITIAL_PASSWORD,
        confirmation: TEMPORARY_INITIAL_PASSWORD,
        ipAddress: `192.0.2.${70 + index}`,
      }),
      400,
      "temporary_password_reuse",
    );
  }
});

test("enforces server-side role authorization", async () => {
  const driver = await createUser({ role: "driver" });
  const context = {
    session: { id: 1, userId: driver.id, tokenHash: "hash", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null },
    user: driver,
    biometricStatus: "not_enrolled",
  };
  assert.throws(
    () => requireReadyUser(context, ["supervisor", "system_admin"]),
    (error) => error instanceof IdentityError && error.status === 403,
  );
  assert.throws(
    () => requireAllowedRole(context, ["system_admin"]),
    (error) => error instanceof IdentityError && error.code === "forbidden",
  );
  const supervisorContext = { ...context, user: { ...driver, role: "supervisor" } };
  assert.equal(requireReadyUser(supervisorContext, ["supervisor", "system_admin"]), supervisorContext);
});

test("keeps preview disabled outside explicitly flagged development", () => {
  assert.equal(isIdentityPreviewEnabled("production", "true"), false);
  assert.equal(isIdentityPreviewEnabled("development", undefined), false);
  assert.equal(isIdentityPreviewEnabled("development", "false"), false);
  assert.equal(isIdentityPreviewEnabled("development", "true"), true);
});

test("maps profile fields from the authenticated session", async () => {
  const user = await createUser({
    displayName: "Authenticated Name",
    loginCode: "AUTH77",
    email: "authenticated@example.invalid",
    phone: "01000000001",
    role: "supervisor",
    preferredLanguage: "en",
  });
  const context = {
    session: { id: 1, userId: user.id, tokenHash: "hash", expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null },
    user,
    biometricStatus: "approved",
  };
  assert.deepEqual(toPublicIdentityUser(context), {
    displayName: "Authenticated Name",
    loginCode: "AUTH77",
    email: "authenticated@example.invalid",
    phone: "01000000001",
    role: "supervisor",
    mustChangePassword: false,
    preferredLanguage: "en",
    photoUrl: null,
    biometricStatus: "approved",
  });
});

test("binds the profile UI to the restored authenticated user", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /value=\{user\.loginCode\}/);
  assert.match(source, /value=\{user\.email\?\?/);
  assert.match(source, /value=\{user\.phone\?\?/);
  assert.match(source, /user\.biometricStatus/);
  assert.equal(source.includes("محمد سعد"), false);
  assert.equal(source.includes("driver@example.com"), false);
});

test("keeps driver profiles vehicle-free and adds rate-limit retention indexes", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const migration = await readFile(
    new URL("../drizzle/0000_identity_foundation.sql", import.meta.url),
    "utf8",
  );
  assert.equal(schema.includes("vehicleNumber"), false);
  assert.equal(migration.includes("vehicle_number"), false);
  assert.match(migration, /login_attempts_login_code_idx/);
  assert.match(migration, /login_attempts_ip_idx/);
  assert.match(migration, /auth_sessions_retention_idx/);
});

test("builds an idempotent bootstrap without embedding plaintext passwords", async () => {
  const sql = await buildBootstrapSql([{
    loginCode: "ADMIN01",
    displayName: "Environment Supplied Administrator",
    password: "Bootstrap-only-safe-password",
    role: "system_admin",
    temporaryCredential: false,
    mustChangePassword: false,
  }]);
  assert.match(sql, /ON CONFLICT\(login_code\) DO NOTHING/);
  assert.match(sql, /must_change_password/);
  assert.equal(sql.includes("Bootstrap-only-safe-password"), false);
  assert.equal(sql.includes(TEMPORARY_INITIAL_PASSWORD), false);
});

test("permits explicit temporary credentials only for invited drivers and supervisors", async () => {
  for (const role of ["driver", "supervisor"]) {
    const sql = await buildBootstrapSql([
      {
        loginCode: "ADMIN01",
        displayName: "Test Administrator",
        password: "Bootstrap-only-safe-password",
        role: "system_admin",
        temporaryCredential: false,
        mustChangePassword: false,
      },
      {
        loginCode: role === "driver" ? "DRIVER01" : "SUPERVISOR01",
        displayName: `Test ${role}`,
        password: TEMPORARY_INITIAL_PASSWORD,
        role,
        temporaryCredential: true,
        mustChangePassword: true,
      },
    ]);
    assert.match(sql, /'invited'/);
    assert.equal(sql.includes(TEMPORARY_INITIAL_PASSWORD), false);
  }
});

test("rejects temporary bootstrap credentials for system administrators", async () => {
  await assert.rejects(
    () => buildBootstrapSql([{
      loginCode: "ADMIN01",
      displayName: "Test Administrator",
      password: TEMPORARY_INITIAL_PASSWORD,
      role: "system_admin",
      temporaryCredential: true,
      mustChangePassword: true,
    }]),
    /Temporary credential policy/,
  );
});

test("rejects temporary bootstrap credentials unless both policy flags are explicit", async () => {
  const administrator = {
    loginCode: "ADMIN01",
    displayName: "Test Administrator",
    password: "Bootstrap-only-safe-password",
    role: "system_admin",
    temporaryCredential: false,
    mustChangePassword: false,
  };
  for (const flags of [
    { temporaryCredential: false, mustChangePassword: true },
    { temporaryCredential: true, mustChangePassword: false },
  ]) {
    await assert.rejects(
      () => buildBootstrapSql([
        administrator,
        {
          loginCode: "DRIVER01",
          displayName: "Test Driver",
          password: TEMPORARY_INITIAL_PASSWORD,
          role: "driver",
          ...flags,
        },
      ]),
      /Temporary credential policy/,
    );
  }
});

test("rejects a temporaryCredential flag paired with a permanent password", async () => {
  await assert.rejects(
    () => buildBootstrapSql([
      {
        loginCode: "ADMIN01",
        displayName: "Test Administrator",
        password: "Bootstrap-only-safe-password",
        role: "system_admin",
        temporaryCredential: false,
        mustChangePassword: false,
      },
      {
        loginCode: "DRIVER01",
        displayName: "Test Driver",
        password: "Driver-permanent-safe-password",
        role: "driver",
        temporaryCredential: true,
        mustChangePassword: true,
      },
    ]),
    /Temporary credential policy/,
  );
});

test("rejects bootstrap records with omitted credential policy flags", async () => {
  await assert.rejects(
    () => buildBootstrapSql([{
      loginCode: "ADMIN01",
      displayName: "Test Administrator",
      password: "Bootstrap-only-safe-password",
      role: "system_admin",
    }]),
    /Credential policy flags must be explicit/,
  );
});
