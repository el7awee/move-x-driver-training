import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import {
  IDENTITY_ROLES,
  hashPassword,
  normalizeLoginCode,
  validLoginCode,
  validNewPassword,
  type IdentityRole,
} from "../lib/identity/core.ts";

export interface BootstrapUserInput {
  loginCode: string;
  displayName: string;
  password: string;
  role: IdentityRole;
  email?: string | null;
  phone?: string | null;
  preferredLanguage?: "ar" | "en";
}

function sqlValue(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${value.replaceAll("'", "''")}'`;
}

function validateBootstrapUser(input: BootstrapUserInput) {
  const loginCode = normalizeLoginCode(input.loginCode);
  if (!validLoginCode(loginCode)) throw new Error(`Invalid bootstrap login code: ${loginCode}`);
  if (!input.displayName.trim()) throw new Error(`Missing display name for ${loginCode}`);
  if (!IDENTITY_ROLES.includes(input.role)) throw new Error(`Invalid role for ${loginCode}`);
  if (!validNewPassword(input.password) || input.password === "12345678") {
    throw new Error(`Bootstrap password does not meet policy for ${loginCode}`);
  }
  return { ...input, loginCode, displayName: input.displayName.trim() };
}

export async function buildBootstrapSql(inputs: BootstrapUserInput[]) {
  if (inputs.length === 0) throw new Error("At least one bootstrap user is required");
  const validated = inputs.map(validateBootstrapUser);
  const distinctCodes = new Set(validated.map((user) => user.loginCode));
  if (distinctCodes.size !== validated.length) throw new Error("Bootstrap login codes must be unique");
  if (!validated.some((user) => user.role === "system_admin")) {
    throw new Error("Bootstrap input must include a system administrator");
  }

  const statements = ["BEGIN IMMEDIATE;"];
  for (const user of validated) {
    const passwordHash = await hashPassword(user.password);
    statements.push(
      "INSERT INTO users " +
      "(login_code, display_name, email, phone, role, password_hash, must_change_password, status, preferred_language) VALUES (" +
      [
        sqlValue(user.loginCode),
        sqlValue(user.displayName),
        sqlValue(user.email),
        sqlValue(user.phone),
        sqlValue(user.role),
        sqlValue(passwordHash),
        "true",
        sqlValue("invited"),
        sqlValue(user.preferredLanguage ?? "ar"),
      ].join(", ") +
      ") ON CONFLICT(login_code) DO NOTHING;",
    );
  }
  statements.push("COMMIT;");
  return statements.join("\n");
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readUsersFromEnvironment() {
  const administrator: BootstrapUserInput = {
    loginCode: requiredEnvironment("BOOTSTRAP_ADMIN_LOGIN_CODE"),
    displayName: requiredEnvironment("BOOTSTRAP_ADMIN_DISPLAY_NAME"),
    password: requiredEnvironment("BOOTSTRAP_ADMIN_PASSWORD"),
    role: "system_admin",
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    phone: process.env.BOOTSTRAP_ADMIN_PHONE,
    preferredLanguage: process.env.BOOTSTRAP_ADMIN_LANGUAGE === "en" ? "en" : "ar",
  };
  const testUsersJson = process.env.BOOTSTRAP_TEST_USERS_JSON?.trim();
  if (!testUsersJson) return [administrator];
  const parsed = JSON.parse(testUsersJson) as BootstrapUserInput[];
  if (!Array.isArray(parsed)) throw new Error("BOOTSTRAP_TEST_USERS_JSON must be an array");
  return [administrator, ...parsed];
}

async function runWrangler(database: string, target: "development" | "staging", sqlPath: string) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["wrangler", "d1", "execute", database, "--file", sqlPath];
  if (target === "development") args.push("--local");
  else args.push("--remote", "--env", "staging");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Wrangler exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const target = requiredEnvironment("BOOTSTRAP_TARGET");
  if (target !== "development" && target !== "staging") {
    throw new Error("BOOTSTRAP_TARGET must be development or staging; production is forbidden");
  }
  if (
    target === "staging" &&
    process.env.BOOTSTRAP_CONFIRM_STAGING !== "I_UNDERSTAND_THIS_WRITES_TO_STAGING"
  ) {
    throw new Error("Staging bootstrap requires explicit BOOTSTRAP_CONFIRM_STAGING");
  }

  const database = requiredEnvironment("BOOTSTRAP_D1_DATABASE");
  const sql = await buildBootstrapSql(readUsersFromEnvironment());
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "movex-identity-bootstrap-"));
  const sqlPath = join(temporaryDirectory, "bootstrap.sql");
  try {
    await writeFile(sqlPath, sql, { encoding: "utf8", mode: 0o600 });
    await runWrangler(database, target, sqlPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Identity bootstrap failed";
    console.error(message);
    process.exitCode = 1;
  });
}
