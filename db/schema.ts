import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const currentIsoTimestamp = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const timestamps = {
  createdAt: text("created_at").notNull().default(currentIsoTimestamp),
  updatedAt: text("updated_at").notNull().default(currentIsoTimestamp),
};

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loginCode: text("login_code").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role", { enum: ["driver", "supervisor", "system_admin"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  status: text("status", { enum: ["invited", "active", "suspended"] }).notNull().default("invited"),
  preferredLanguage: text("preferred_language", { enum: ["ar", "en"] }).notNull().default("ar"),
  photoObjectKey: text("photo_object_key"),
  lastLoginAt: text("last_login_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("users_login_code_unique").on(table.loginCode),
  uniqueIndex("users_email_unique").on(table.email),
  index("users_role_status_idx").on(table.role, table.status),
]);

export const driverProfiles = sqliteTable("driver_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  employeeCode: text("employee_code").notNull(),
  licenseNumber: text("license_number"),
  licenseExpiresAt: text("license_expires_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("driver_profiles_user_unique").on(table.userId),
  uniqueIndex("driver_profiles_employee_code_unique").on(table.employeeCode),
]);

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  trustedUntil: text("trusted_until"),
  biometricVerifiedAt: text("biometric_verified_at"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  uniqueIndex("auth_sessions_token_unique").on(table.tokenHash),
  index("auth_sessions_user_idx").on(table.userId, table.expiresAt),
  index("auth_sessions_retention_idx").on(table.expiresAt, table.revokedAt),
]);

export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loginCode: text("login_code").notNull(),
  ipHash: text("ip_hash").notNull(),
  succeeded: integer("succeeded", { mode: "boolean" }).notNull().default(false),
  attemptedAt: text("attempted_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  index("login_attempts_login_code_idx").on(table.loginCode, table.succeeded, table.attemptedAt),
  index("login_attempts_ip_idx").on(table.ipHash, table.succeeded, table.attemptedAt),
  index("login_attempts_retention_idx").on(table.attemptedAt),
]);

export const biometricEnrollments = sqliteTable("biometric_enrollments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerSubjectId: text("provider_subject_id").notNull(),
  referencePhotoObjectKey: text("reference_photo_object_key"),
  consentVersion: text("consent_version").notNull(),
  consentedAt: text("consented_at").notNull(),
  approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  approvedAt: text("approved_at"),
  status: text("status", { enum: ["pending", "approved", "rejected", "revoked"] }).notNull().default("pending"),
  ...timestamps,
}, (table) => [
  uniqueIndex("biometric_enrollments_user_unique").on(table.userId),
  index("biometric_enrollments_status_idx").on(table.status),
]);

export const biometricVerifications = sqliteTable("biometric_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  sessionId: integer("session_id").references(() => authSessions.id),
  purpose: text("purpose", {
    enum: ["login", "shift_start", "course_start", "exam_start", "trip_submit", "incident_submit", "sensitive_action"],
  }).notNull(),
  moduleKey: text("module_key").notNull(),
  providerReference: text("provider_reference"),
  livenessPassed: integer("liveness_passed", { mode: "boolean" }).notNull().default(false),
  faceMatched: integer("face_matched", { mode: "boolean" }).notNull().default(false),
  confidence: integer("confidence"),
  decision: text("decision", { enum: ["approved", "rejected", "manual_review"] }).notNull(),
  verifiedAt: text("verified_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  index("biometric_verifications_user_idx").on(table.userId, table.verifiedAt),
  index("biometric_verifications_module_idx").on(table.moduleKey, table.purpose),
]);

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  moduleKey: text("module_key").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  result: text("result", { enum: ["success", "failure", "blocked"] }).notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  index("audit_logs_actor_idx").on(table.actorUserId, table.createdAt),
  index("audit_logs_module_idx").on(table.moduleKey, table.createdAt),
]);
