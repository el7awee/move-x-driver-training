export const IDENTITY_ROLES = ["driver", "supervisor", "system_admin"] as const;
export const TEMPORARY_INITIAL_PASSWORD = ["1234", "5678"].join("");

export type IdentityRole = (typeof IDENTITY_ROLES)[number];
export type IdentityUserStatus = "invited" | "active" | "suspended";
export type BiometricStatus =
  | "not_enrolled"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export interface IdentityUser {
  id: number;
  loginCode: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: IdentityRole;
  passwordHash: string;
  mustChangePassword: boolean;
  status: IdentityUserStatus;
  preferredLanguage: "ar" | "en";
  photoObjectKey: string | null;
}

export interface IdentitySession {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface SessionContext {
  session: IdentitySession;
  user: IdentityUser;
  biometricStatus: BiometricStatus;
}

export interface PublicIdentityUser {
  displayName: string;
  loginCode: string;
  email: string | null;
  phone: string | null;
  role: IdentityRole;
  mustChangePassword: boolean;
  preferredLanguage: "ar" | "en";
  photoUrl: string | null;
  biometricStatus: BiometricStatus;
}

export interface LoginAttemptInput {
  loginCode: string;
  ipHash: string;
  succeeded: boolean;
  attemptedAt: string;
}

export interface NewSessionInput {
  userId: number;
  tokenHash: string;
  ipHash: string;
  userAgent: string | null;
  expiresAt: string;
}

export interface AuditInput {
  actorUserId?: number;
  action: string;
  moduleKey: string;
  result: "success" | "failure" | "blocked";
  metadataJson?: string;
  createdAt: string;
}

export interface IdentityStore {
  findUserByLoginCode(loginCode: string): Promise<IdentityUser | null>;
  countRecentFailuresForLoginCode(loginCode: string, since: string): Promise<number>;
  countRecentFailuresForIp(ipHash: string, since: string): Promise<number>;
  recordLoginAttempt(input: LoginAttemptInput): Promise<void>;
  createSession(input: NewSessionInput): Promise<IdentitySession>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionContext | null>;
  getBiometricStatus(userId: number): Promise<BiometricStatus>;
  markSuccessfulLogin(userId: number, at: string): Promise<void>;
  updatePassword(userId: number, passwordHash: string, at: string): Promise<void>;
  revokeSession(sessionId: number, at: string): Promise<void>;
  revokeSessionsForUser(userId: number, at: string): Promise<void>;
  writeAudit(input: AuditInput): Promise<void>;
}

export class IdentityError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Cloudflare Workers supports PBKDF2 iteration counts up to 100,000.
const PASSWORD_ITERATIONS = 100_000;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_CODE_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 20;
const encoder = new TextEncoder();
let dummyPasswordHash: Promise<string> | null = null;

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function normalizeLoginCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function validLoginCode(value: string) {
  return /^[A-Z0-9_-]{3,24}$/.test(value);
}

export function validNewPassword(value: string) {
  return value.length >= 8 && value.length <= 128 && !/^\s+$/.test(value);
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  try {
    const [algorithm, iterationsValue, saltValue, expectedValue] = encodedHash.split("$");
    if (algorithm !== "pbkdf2-sha256" || !iterationsValue || !saltValue || !expectedValue) {
      return false;
    }
    const iterations = Number(iterationsValue);
    if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
      return false;
    }

    const actual = await derivePassword(password, base64ToBytes(saltValue), iterations);
    const expected = base64ToBytes(expectedValue);
    if (actual.length !== expected.length) return false;

    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) {
      difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function keyedIpHash(ipAddress: string, keyValue: string) {
  if (keyValue.length < 32) {
    throw new Error("AUTH_IP_HASH_KEY must contain at least 32 characters");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(keyValue),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(ipAddress.trim().toLowerCase() || "unknown"),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export function isIdentityPreviewEnabled(
  nodeEnvironment: string | undefined,
  previewFlag: string | undefined,
) {
  return nodeEnvironment === "development" && previewFlag === "true";
}

export function toPublicIdentityUser(context: SessionContext): PublicIdentityUser {
  return {
    displayName: context.user.displayName,
    loginCode: context.user.loginCode,
    email: context.user.email,
    phone: context.user.phone,
    role: context.user.role,
    mustChangePassword: context.user.mustChangePassword,
    preferredLanguage: context.user.preferredLanguage,
    photoUrl: null,
    biometricStatus: context.biometricStatus,
  };
}

export function requireAuthenticatedUser(context: SessionContext | null) {
  if (!context) {
    throw new IdentityError(401, "unauthenticated", "انتهت الجلسة. سجل الدخول مرة أخرى.");
  }
  if (context.user.status === "suspended") {
    throw new IdentityError(403, "account_suspended", "هذا الحساب موقوف.");
  }
  return context;
}

export function enforcePasswordChanged(context: SessionContext) {
  if (context.user.mustChangePassword) {
    throw new IdentityError(
      428,
      "password_change_required",
      "يجب تغيير كلمة السر المؤقتة قبل استخدام النظام.",
    );
  }
  return context;
}

export function requireAllowedRole(
  context: SessionContext,
  allowedRoles: readonly IdentityRole[],
) {
  if (!allowedRoles.includes(context.user.role)) {
    throw new IdentityError(403, "forbidden", "لا تملك صلاحية تنفيذ هذا الإجراء.");
  }
  return context;
}

export function requireReadyUser(
  context: SessionContext | null,
  allowedRoles?: readonly IdentityRole[],
) {
  const authenticated = enforcePasswordChanged(requireAuthenticatedUser(context));
  return allowedRoles ? requireAllowedRole(authenticated, allowedRoles) : authenticated;
}

export interface IdentityServiceOptions {
  ipHashKey: string;
  now?: () => Date;
}

export class IdentityService {
  private readonly now: () => Date;
  private readonly store: IdentityStore;
  private readonly options: IdentityServiceOptions;

  constructor(
    store: IdentityStore,
    options: IdentityServiceOptions,
  ) {
    this.store = store;
    this.options = options;
    this.now = options.now ?? (() => new Date());
  }

  async login(input: {
    loginCode: string;
    password: string;
    ipAddress: string;
    userAgent?: string | null;
  }) {
    const loginCode = normalizeLoginCode(input.loginCode);
    if (!validLoginCode(loginCode) || !input.password) {
      throw new IdentityError(400, "invalid_request", "أدخل كود المستخدم وكلمة السر.");
    }

    const now = this.now();
    const attemptedAt = now.toISOString();
    const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS).toISOString();
    const ipHash = await keyedIpHash(input.ipAddress, this.options.ipHashKey);
    const [loginCodeFailures, ipFailures] = await Promise.all([
      this.store.countRecentFailuresForLoginCode(loginCode, since),
      this.store.countRecentFailuresForIp(ipHash, since),
    ]);

    if (loginCodeFailures >= LOGIN_CODE_FAILURE_LIMIT || ipFailures >= IP_FAILURE_LIMIT) {
      await this.store.writeAudit({
        action: "auth.login",
        moduleKey: "identity",
        result: "blocked",
        metadataJson: JSON.stringify({
          reason: loginCodeFailures >= LOGIN_CODE_FAILURE_LIMIT ? "account_rate_limit" : "ip_rate_limit",
        }),
        createdAt: attemptedAt,
      });
      throw new IdentityError(
        429,
        "rate_limited",
        "تم إيقاف محاولات الدخول مؤقتًا. حاول بعد 15 دقيقة.",
      );
    }

    const user = await this.store.findUserByLoginCode(loginCode);
    dummyPasswordHash ??= hashPassword(crypto.randomUUID());
    const passwordMatches = await verifyPassword(
      input.password,
      user?.passwordHash ?? await dummyPasswordHash,
    );
    const succeeded = Boolean(
      user &&
      passwordMatches &&
      (user.status === "active" || user.status === "invited"),
    );

    await this.store.recordLoginAttempt({ loginCode, ipHash, succeeded, attemptedAt });
    if (!succeeded || !user) {
      await this.store.writeAudit({
        actorUserId: user?.id,
        action: "auth.login",
        moduleKey: "identity",
        result: "failure",
        metadataJson: JSON.stringify({ reason: "invalid_credentials" }),
        createdAt: attemptedAt,
      });
      throw new IdentityError(
        401,
        "invalid_credentials",
        "كود المستخدم أو كلمة السر غير صحيحة.",
      );
    }

    const issued = await this.issueSession(user, ipHash, input.userAgent ?? null, now);
    await this.store.markSuccessfulLogin(user.id, attemptedAt);
    await this.store.writeAudit({
      actorUserId: user.id,
      action: "auth.login",
      moduleKey: "identity",
      result: "success",
      createdAt: attemptedAt,
    });
    return issued;
  }

  async restoreSession(token: string | null) {
    if (!token) return null;
    const tokenHash = await sha256(token);
    const context = await this.store.findSessionByTokenHash(tokenHash);
    if (!context || context.session.revokedAt || context.user.status === "suspended") return null;
    if (Date.parse(context.session.expiresAt) <= this.now().getTime()) {
      await this.store.revokeSession(context.session.id, this.now().toISOString());
      return null;
    }
    return context;
  }

  async changePassword(
    context: SessionContext,
    input: {
      password: string;
      confirmation: string;
      ipAddress: string;
      userAgent?: string | null;
    },
  ) {
    requireAuthenticatedUser(context);
    if (!validNewPassword(input.password)) {
      throw new IdentityError(
        400,
        "invalid_password",
        "كلمة السر الجديدة يجب أن تكون بين 8 و128 خانة.",
      );
    }
    if (input.password !== input.confirmation) {
      throw new IdentityError(400, "password_mismatch", "تأكيد كلمة السر غير مطابق.");
    }
    if (input.password === TEMPORARY_INITIAL_PASSWORD) {
      throw new IdentityError(
        400,
        "temporary_password_reuse",
        "اختر كلمة سر مختلفة عن كلمة السر المؤقتة.",
      );
    }

    const now = this.now();
    const changedAt = now.toISOString();
    await this.store.updatePassword(
      context.user.id,
      await hashPassword(input.password),
      changedAt,
    );
    await this.store.revokeSessionsForUser(context.user.id, changedAt);
    const updatedUser = { ...context.user, passwordHash: "", mustChangePassword: false };
    const ipHash = await keyedIpHash(input.ipAddress, this.options.ipHashKey);
    const issued = await this.issueSession(
      updatedUser,
      ipHash,
      input.userAgent ?? null,
      now,
    );
    await this.store.writeAudit({
      actorUserId: context.user.id,
      action: "auth.password_changed",
      moduleKey: "identity",
      result: "success",
      createdAt: changedAt,
    });
    return issued;
  }

  async logout(context: SessionContext) {
    const at = this.now().toISOString();
    await this.store.revokeSession(context.session.id, at);
    await this.store.writeAudit({
      actorUserId: context.user.id,
      action: "auth.logout",
      moduleKey: "identity",
      result: "success",
      createdAt: at,
    });
  }

  private async issueSession(
    user: IdentityUser,
    ipHash: string,
    userAgent: string | null,
    now: Date,
  ) {
    const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();
    const session = await this.store.createSession({
      userId: user.id,
      tokenHash: await sha256(token),
      ipHash,
      userAgent: userAgent?.slice(0, 500) ?? null,
      expiresAt,
    });
    const biometricStatus = await this.store.getBiometricStatus(user.id);
    return {
      token,
      context: { session, user, biometricStatus } satisfies SessionContext,
    };
  }
}
