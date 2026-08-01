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

export const courses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  passPercentage: integer("pass_percentage").notNull().default(80),
  maxAttempts: integer("max_attempts"),
  quizUnlockPercentage: integer("quiz_unlock_percentage").notNull().default(80),
  showExplanationsAfterSubmission: integer("show_explanations_after_submission", { mode: "boolean" }).notNull().default(true),
  videoObjectKey: text("video_object_key"),
  videoFilename: text("video_filename"),
  videoContentType: text("video_content_type"),
  videoSizeBytes: integer("video_size_bytes"),
  videoChecksum: text("video_checksum"),
  videoDurationSeconds: integer("video_duration_seconds"),
  videoCodec: text("video_codec"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  publishedAt: text("published_at"),
  ...timestamps,
}, (table) => [
  uniqueIndex("courses_slug_unique").on(table.slug),
  index("courses_status_idx").on(table.status, table.createdAt),
]);

export const courseQuestions = sqliteTable("course_questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  prompt: text("prompt").notNull(),
  correctOptionIndex: integer("correct_option_index").notNull(),
  explanation: text("explanation").notNull().default(""),
  ...timestamps,
}, (table) => [
  uniqueIndex("course_questions_position_unique").on(table.courseId, table.position),
  index("course_questions_course_idx").on(table.courseId),
]);

export const courseQuestionOptions = sqliteTable("course_question_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id").notNull().references(() => courseQuestions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("course_question_options_position_unique").on(table.questionId, table.position),
]);

export const courseAssignments = sqliteTable("course_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedByUserId: integer("assigned_by_user_id").notNull().references(() => users.id),
  dueAt: text("due_at"),
  status: text("status", { enum: ["assigned", "completed", "cancelled"] }).notNull().default("assigned"),
  createdAt: text("created_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  uniqueIndex("course_assignments_course_user_unique").on(table.courseId, table.userId),
  index("course_assignments_user_idx").on(table.userId, table.status),
]);

export const courseProgress = sqliteTable("course_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoSeconds: integer("video_seconds").notNull().default(0),
  videoPercentage: integer("video_percentage").notNull().default(0),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  uniqueIndex("course_progress_course_user_unique").on(table.courseId, table.userId),
  index("course_progress_user_idx").on(table.userId, table.updatedAt),
]);

export const quizAttempts = sqliteTable("quiz_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  courseId: integer("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  scorePercentage: integer("score_percentage").notNull(),
  passed: integer("passed", { mode: "boolean" }).notNull(),
  submittedAt: text("submitted_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  uniqueIndex("quiz_attempts_number_unique").on(table.courseId, table.userId, table.attemptNumber),
  index("quiz_attempts_user_idx").on(table.userId, table.submittedAt),
]);

export const quizAnswers = sqliteTable("quiz_answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  attemptId: integer("attempt_id").notNull().references(() => quizAttempts.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => courseQuestions.id),
  selectedOptionIndex: integer("selected_option_index").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
}, (table) => [
  uniqueIndex("quiz_answers_attempt_question_unique").on(table.attemptId, table.questionId),
]);

export const trainingNotifications = sqliteTable("training_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: integer("course_id").references(() => courses.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["assigned", "due", "passed", "failed"] }).notNull(),
  message: text("message").notNull(),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull().default(currentIsoTimestamp),
}, (table) => [
  index("training_notifications_user_idx").on(table.userId, table.readAt, table.createdAt),
]);
