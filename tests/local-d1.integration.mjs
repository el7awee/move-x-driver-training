import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  IdentityError,
  IdentityService,
  TEMPORARY_INITIAL_PASSWORD,
  enforcePasswordChanged,
  requireReadyUser,
  sha256,
  toPublicIdentityUser,
  verifyPassword,
} from "../lib/identity/core.ts";
import { buildBootstrapSql } from "../scripts/bootstrap-identity.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseName = "movex-identity-isolated-test";
const ipHashKey = "local-d1-integration-key-material-32-characters";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return result;
}

async function findSqliteFile(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findSqliteFile(path);
      if (nested) return nested;
    } else if (entry.name.endsWith(".sqlite")) {
      return path;
    }
  }
  return null;
}

function mapUser(row) {
  return {
    id: Number(row.id),
    loginCode: row.login_code,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    passwordHash: row.password_hash,
    mustChangePassword: Boolean(row.must_change_password),
    status: row.status,
    preferredLanguage: row.preferred_language,
    photoObjectKey: row.photo_object_key,
  };
}

function mapSession(row) {
  return {
    id: Number(row.session_id ?? row.id),
    userId: Number(row.user_id),
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

class LocalD1IdentityStore {
  constructor(database) {
    this.database = database;
  }

  async findUserByLoginCode(loginCode) {
    const row = this.database.prepare(
      "SELECT * FROM users WHERE login_code = ? LIMIT 1",
    ).get(loginCode);
    return row ? mapUser(row) : null;
  }

  async countRecentFailuresForLoginCode(loginCode, since) {
    return Number(this.database.prepare(
      "SELECT COUNT(*) AS value FROM login_attempts WHERE login_code = ? AND succeeded = 0 AND attempted_at >= ?",
    ).get(loginCode, since).value);
  }

  async countRecentFailuresForIp(ipHash, since) {
    return Number(this.database.prepare(
      "SELECT COUNT(*) AS value FROM login_attempts WHERE ip_hash = ? AND succeeded = 0 AND attempted_at >= ?",
    ).get(ipHash, since).value);
  }

  async recordLoginAttempt(input) {
    this.database.prepare(
      "INSERT INTO login_attempts (login_code, ip_hash, succeeded, attempted_at) VALUES (?, ?, ?, ?)",
    ).run(input.loginCode, input.ipHash, input.succeeded ? 1 : 0, input.attemptedAt);
  }

  async createSession(input) {
    const result = this.database.prepare(
      "INSERT INTO auth_sessions (user_id, token_hash, ip_hash, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run(input.userId, input.tokenHash, input.ipHash, input.userAgent, input.expiresAt);
    const row = this.database.prepare(
      "SELECT id AS session_id, user_id, token_hash, expires_at, revoked_at FROM auth_sessions WHERE id = ?",
    ).get(result.lastInsertRowid);
    return mapSession(row);
  }

  async findSessionByTokenHash(tokenHash) {
    const row = this.database.prepare(
      `SELECT s.id AS session_id, s.user_id, s.token_hash, s.expires_at, s.revoked_at,
        u.id, u.login_code, u.display_name, u.email, u.phone, u.role, u.password_hash,
        u.must_change_password, u.status, u.preferred_language, u.photo_object_key
      FROM auth_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
      LIMIT 1`,
    ).get(tokenHash);
    if (!row) return null;
    return {
      session: mapSession(row),
      user: mapUser(row),
      biometricStatus: await this.getBiometricStatus(Number(row.user_id)),
    };
  }

  async getBiometricStatus(userId) {
    const row = this.database.prepare(
      "SELECT status FROM biometric_enrollments WHERE user_id = ? LIMIT 1",
    ).get(userId);
    return row?.status ?? "not_enrolled";
  }

  async markSuccessfulLogin(userId, at) {
    this.database.prepare(
      "UPDATE users SET last_login_at = ?, status = 'active', updated_at = ? WHERE id = ?",
    ).run(at, at, userId);
  }

  async updatePassword(userId, passwordHash, at) {
    this.database.prepare(
      "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
    ).run(passwordHash, at, userId);
  }

  async revokeSession(sessionId, at) {
    this.database.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").run(at, sessionId);
  }

  async revokeSessionsForUser(userId, at) {
    this.database.prepare(
      "UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    ).run(at, userId);
  }

  async writeAudit(input) {
    this.database.prepare(
      "INSERT INTO audit_logs (actor_user_id, action, module_key, result, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      input.actorUserId ?? null,
      input.action,
      input.moduleKey,
      input.result,
      input.metadataJson ?? "{}",
      input.createdAt,
    );
  }
}

async function expectIdentityError(action, expectedCode) {
  await assert.rejects(action, (error) =>
    error instanceof IdentityError && error.code === expectedCode
  );
}

test("isolated local D1 enforces the full temporary-credential lifecycle", async (context) => {
  const persistTo = await mkdtemp(join(tmpdir(), "movex-local-d1-"));
  const wranglerCli = join(repositoryRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const administratorPassword = `Local-admin-${randomUUID()}`;
  const replacementPassword = `Local-driver-${randomUUID()}`;
  const wranglerConfig = join(persistTo, "wrangler.local-test.json");
  let database;

  try {
    await writeFile(
      wranglerConfig,
      JSON.stringify({
        name: "movex-identity-local-test",
        compatibility_date: "2026-07-24",
        d1_databases: [{
          binding: "DB",
          database_name: databaseName,
          database_id: "00000000-0000-0000-0000-000000000000",
        }],
      }),
      { encoding: "utf8", mode: 0o600 },
    );
    run(process.execPath, [
      wranglerCli,
      "d1",
      "execute",
      databaseName,
      "--local",
      "--persist-to",
      persistTo,
      "--file",
      "drizzle/0000_identity_foundation.sql",
      "--config",
      wranglerConfig,
    ]);
    context.diagnostic("initial identity migration applied to isolated local D1");

    const bootstrapEnvironment = {
      ...process.env,
      BOOTSTRAP_TARGET: "development",
      BOOTSTRAP_D1_DATABASE: databaseName,
      BOOTSTRAP_D1_PERSIST_TO: persistTo,
      BOOTSTRAP_WRANGLER_CONFIG: wranglerConfig,
      BOOTSTRAP_ADMIN_LOGIN_CODE: "LOCALADMIN",
      BOOTSTRAP_ADMIN_DISPLAY_NAME: "Local Test Administrator",
      BOOTSTRAP_ADMIN_PASSWORD: administratorPassword,
      BOOTSTRAP_ADMIN_MUST_CHANGE_PASSWORD: "false",
      BOOTSTRAP_TEST_USERS_JSON: JSON.stringify([{
        loginCode: "LOCALDRIVER",
        displayName: "Local Test Driver",
        password: TEMPORARY_INITIAL_PASSWORD,
        role: "driver",
        temporaryCredential: true,
        mustChangePassword: true,
      }]),
    };
    const bootstrapArgs = [
      "--experimental-strip-types",
      "scripts/bootstrap-identity.ts",
    ];
    run(process.execPath, bootstrapArgs, { env: bootstrapEnvironment });
    run(process.execPath, bootstrapArgs, { env: bootstrapEnvironment });

    const sqlitePath = await findSqliteFile(persistTo);
    assert.ok(sqlitePath, "Wrangler did not create an isolated local D1 SQLite file");
    database = new DatabaseSync(sqlitePath);
    database.exec("PRAGMA foreign_keys = ON");

    const userCount = Number(
      database.prepare("SELECT COUNT(*) AS value FROM users").get().value,
    );
    assert.equal(userCount, 2);
    context.diagnostic("bootstrap applied twice; exactly 2 users remain");

    await assert.rejects(
      () => buildBootstrapSql([{
        loginCode: "BADADMIN",
        displayName: "Rejected Test Administrator",
        password: TEMPORARY_INITIAL_PASSWORD,
        role: "system_admin",
        temporaryCredential: true,
        mustChangePassword: true,
      }]),
      /Temporary credential policy/,
    );

    const store = new LocalD1IdentityStore(database);
    const service = new IdentityService(store, { ipHashKey });
    await expectIdentityError(
      () => service.login({
        loginCode: "LOCALADMIN",
        password: TEMPORARY_INITIAL_PASSWORD,
        ipAddress: "192.0.2.10",
      }),
      "invalid_credentials",
    );
    context.diagnostic("system administrator rejected the temporary initial password");

    const login = await service.login({
      loginCode: "LOCALDRIVER",
      password: TEMPORARY_INITIAL_PASSWORD,
      ipAddress: "192.0.2.20",
      userAgent: "local-d1-integration",
    });
    assert.equal(login.context.user.mustChangePassword, true);
    assert.throws(() => enforcePasswordChanged(login.context), (error) =>
      error instanceof IdentityError && error.code === "password_change_required"
    );
    assert.throws(() => requireReadyUser(login.context), (error) =>
      error instanceof IdentityError && error.code === "password_change_required"
    );
    assert.equal(
      toPublicIdentityUser(await service.restoreSession(login.token)).mustChangePassword,
      true,
    );
    context.diagnostic("invited driver logged in and /api/auth/me-equivalent restoration requires password change");

    const changed = await service.changePassword(login.context, {
      password: replacementPassword,
      confirmation: replacementPassword,
      ipAddress: "192.0.2.20",
      userAgent: "local-d1-integration",
    });
    assert.notEqual(changed.token, login.token);
    assert.equal(changed.context.user.mustChangePassword, false);
    assert.equal(await service.restoreSession(login.token), null);
    await expectIdentityError(
      () => service.login({
        loginCode: "LOCALDRIVER",
        password: TEMPORARY_INITIAL_PASSWORD,
        ipAddress: "192.0.2.21",
      }),
      "invalid_credentials",
    );
    const driver = await store.findUserByLoginCode("LOCALDRIVER");
    assert.equal(await verifyPassword(replacementPassword, driver.passwordHash), true);
    assert.equal(driver.passwordHash.includes(replacementPassword), false);
    assert.equal(
      database.prepare("SELECT token_hash FROM auth_sessions WHERE id = ?").get(
        changed.context.session.id,
      ).token_hash,
      await sha256(changed.token),
    );
    context.diagnostic("password replacement issued a fresh hashed session; old session and temporary password rejected");

    assert.equal(
      toPublicIdentityUser(await service.restoreSession(changed.token)).loginCode,
      "LOCALDRIVER",
    );
    await service.logout(changed.context);
    assert.equal(await service.restoreSession(changed.token), null);
    context.diagnostic("logout revoked the fresh session and subsequent /api/auth/me-equivalent restoration is unauthenticated");
  } finally {
    database?.close();
    await rm(persistTo, { recursive: true, force: true });
  }
});
