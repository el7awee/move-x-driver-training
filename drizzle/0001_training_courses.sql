CREATE TABLE `courses` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `pass_percentage` integer DEFAULT 80 NOT NULL,
  `max_attempts` integer,
  `quiz_unlock_percentage` integer DEFAULT 80 NOT NULL,
  `show_explanations_after_submission` integer DEFAULT true NOT NULL,
  `pass_message` text DEFAULT '' NOT NULL,
  `retry_message` text DEFAULT '' NOT NULL,
  `video_source_type` text DEFAULT 'google_drive' NOT NULL,
  `video_source_ref` text,
  `video_status` text DEFAULT 'awaiting_google_drive_url' NOT NULL,
  `video_object_key` text,
  `video_filename` text,
  `video_content_type` text,
  `video_size_bytes` integer,
  `video_checksum` text,
  `video_duration_seconds` integer,
  `video_codec` text,
  `created_by_user_id` integer NOT NULL,
  `published_at` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `courses_slug_unique` ON `courses` (`slug`);
CREATE INDEX `courses_status_idx` ON `courses` (`status`,`created_at`);

CREATE TABLE `course_questions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `course_id` integer NOT NULL,
  `position` integer NOT NULL,
  `prompt` text NOT NULL,
  `correct_option_index` integer NOT NULL,
  `explanation` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `course_questions_position_unique` ON `course_questions` (`course_id`,`position`);
CREATE INDEX `course_questions_course_idx` ON `course_questions` (`course_id`);

CREATE TABLE `course_question_options` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `question_id` integer NOT NULL,
  `position` integer NOT NULL,
  `label` text NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`question_id`) REFERENCES `course_questions`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `course_question_options_position_unique` ON `course_question_options` (`question_id`,`position`);

CREATE TABLE `course_assignments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `course_id` integer NOT NULL,
  `user_id` integer NOT NULL,
  `assigned_by_user_id` integer NOT NULL,
  `due_at` text,
  `status` text DEFAULT 'assigned' NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `course_assignments_course_user_unique` ON `course_assignments` (`course_id`,`user_id`);
CREATE INDEX `course_assignments_user_idx` ON `course_assignments` (`user_id`,`status`);

CREATE TABLE `course_progress` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `course_id` integer NOT NULL,
  `user_id` integer NOT NULL,
  `video_seconds` integer DEFAULT 0 NOT NULL,
  `video_percentage` integer DEFAULT 0 NOT NULL,
  `completed_at` text,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `course_progress_course_user_unique` ON `course_progress` (`course_id`,`user_id`);
CREATE INDEX `course_progress_user_idx` ON `course_progress` (`user_id`,`updated_at`);

CREATE TABLE `quiz_attempts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `course_id` integer NOT NULL,
  `user_id` integer NOT NULL,
  `attempt_number` integer NOT NULL,
  `score_percentage` integer NOT NULL,
  `passed` integer NOT NULL,
  `submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `quiz_attempts_number_unique` ON `quiz_attempts` (`course_id`,`user_id`,`attempt_number`);
CREATE INDEX `quiz_attempts_user_idx` ON `quiz_attempts` (`user_id`,`submitted_at`);

CREATE TABLE `quiz_answers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `attempt_id` integer NOT NULL,
  `question_id` integer NOT NULL,
  `selected_option_index` integer NOT NULL,
  `correct` integer NOT NULL,
  FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`question_id`) REFERENCES `course_questions`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `quiz_answers_attempt_question_unique` ON `quiz_answers` (`attempt_id`,`question_id`);

CREATE TABLE `training_notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `course_id` integer,
  `kind` text NOT NULL,
  `message` text NOT NULL,
  `read_at` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `training_notifications_user_idx` ON `training_notifications` (`user_id`,`read_at`,`created_at`);
