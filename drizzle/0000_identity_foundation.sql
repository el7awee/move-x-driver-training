CREATE TABLE `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `login_code` text NOT NULL,
  `display_name` text NOT NULL,
  `email` text,
  `phone` text,
  `role` text NOT NULL,
  `password_hash` text NOT NULL,
  `must_change_password` integer DEFAULT true NOT NULL,
  `status` text DEFAULT 'invited' NOT NULL,
  `preferred_language` text DEFAULT 'ar' NOT NULL,
  `photo_object_key` text,
  `last_login_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `users_login_code_unique` ON `users` (`login_code`);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE INDEX `users_role_status_idx` ON `users` (`role`,`status`);

CREATE TABLE `driver_profiles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `employee_code` text NOT NULL,
  `license_number` text,
  `license_expires_at` text,
  `vehicle_number` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `driver_profiles_user_unique` ON `driver_profiles` (`user_id`);
CREATE UNIQUE INDEX `driver_profiles_employee_code_unique` ON `driver_profiles` (`employee_code`);

CREATE TABLE `auth_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `token_hash` text NOT NULL,
  `trusted_until` text,
  `biometric_verified_at` text,
  `user_agent` text,
  `ip_hash` text,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token_hash`);
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`,`expires_at`);

CREATE TABLE `login_attempts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `login_code` text NOT NULL,
  `ip_hash` text NOT NULL,
  `succeeded` integer DEFAULT false NOT NULL,
  `attempted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX `login_attempts_lookup_idx` ON `login_attempts` (`login_code`,`ip_hash`,`attempted_at`);

CREATE TABLE `biometric_enrollments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `provider` text NOT NULL,
  `provider_subject_id` text NOT NULL,
  `reference_photo_object_key` text,
  `consent_version` text NOT NULL,
  `consented_at` text NOT NULL,
  `approved_by_user_id` integer,
  `approved_at` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `biometric_enrollments_user_unique` ON `biometric_enrollments` (`user_id`);
CREATE INDEX `biometric_enrollments_status_idx` ON `biometric_enrollments` (`status`);

CREATE TABLE `biometric_verifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `session_id` integer,
  `purpose` text NOT NULL,
  `module_key` text NOT NULL,
  `provider_reference` text,
  `liveness_passed` integer DEFAULT false NOT NULL,
  `face_matched` integer DEFAULT false NOT NULL,
  `confidence` integer,
  `decision` text NOT NULL,
  `verified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `biometric_verifications_user_idx` ON `biometric_verifications` (`user_id`,`verified_at`);
CREATE INDEX `biometric_verifications_module_idx` ON `biometric_verifications` (`module_key`,`purpose`);

CREATE TABLE `audit_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `actor_user_id` integer,
  `action` text NOT NULL,
  `module_key` text NOT NULL,
  `entity_type` text,
  `entity_id` text,
  `result` text NOT NULL,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`,`created_at`);
CREATE INDEX `audit_logs_module_idx` ON `audit_logs` (`module_key`,`created_at`);
