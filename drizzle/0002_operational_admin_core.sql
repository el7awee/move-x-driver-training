CREATE TABLE `vehicles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `internal_code` text NOT NULL,
  `plate_number` text NOT NULL,
  `make` text NOT NULL,
  `model` text NOT NULL,
  `model_year` integer,
  `color` text,
  `status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('active','maintenance','inactive','retired')),
  `notes` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE UNIQUE INDEX `vehicles_internal_code_unique` ON `vehicles` (`internal_code`);
CREATE UNIQUE INDEX `vehicles_plate_number_unique` ON `vehicles` (`plate_number`);
CREATE INDEX `vehicles_status_idx` ON `vehicles` (`status`,`updated_at`);

CREATE TABLE `vehicle_assignments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `driver_user_id` integer NOT NULL,
  `vehicle_id` integer NOT NULL,
  `assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `unassigned_at` text,
  `status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('active','ended')),
  `assigned_by_user_id` integer NOT NULL,
  FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `vehicle_assignments_active_driver_unique` ON `vehicle_assignments` (`driver_user_id`) WHERE `status` = 'active' AND `unassigned_at` IS NULL;
CREATE UNIQUE INDEX `vehicle_assignments_active_vehicle_unique` ON `vehicle_assignments` (`vehicle_id`) WHERE `status` = 'active' AND `unassigned_at` IS NULL;
CREATE INDEX `vehicle_assignments_driver_history_idx` ON `vehicle_assignments` (`driver_user_id`,`assigned_at`);
CREATE INDEX `vehicle_assignments_vehicle_history_idx` ON `vehicle_assignments` (`vehicle_id`,`assigned_at`);

CREATE TABLE `system_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_by_user_id` integer,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO `system_settings` (`key`, `value`) VALUES
  ('company_name', 'Move X'),
  ('default_language', 'ar'),
  ('timezone', 'Africa/Cairo'),
  ('trips_form_url', ''),
  ('show_trips_button', 'false');
