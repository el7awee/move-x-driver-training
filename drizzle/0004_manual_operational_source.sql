CREATE UNIQUE INDEX IF NOT EXISTS `users_phone_unique`
  ON `users` (`phone`) WHERE `phone` IS NOT NULL AND trim(`phone`) <> '';

ALTER TABLE `driver_profiles` ADD COLUMN `national_id_hash` text;
ALTER TABLE `driver_profiles` ADD COLUMN `national_id_last4` text;
ALTER TABLE `driver_profiles` ADD COLUMN `license_type` text;
ALTER TABLE `driver_profiles` ADD COLUMN `license_issued_at` text;
ALTER TABLE `driver_profiles` ADD COLUMN `hire_date` text;
ALTER TABLE `driver_profiles` ADD COLUMN `primary_shift` text NOT NULL DEFAULT 'flexible'
  CHECK (`primary_shift` IN ('morning','evening','night','flexible'));
ALTER TABLE `driver_profiles` ADD COLUMN `location` text;
ALTER TABLE `driver_profiles` ADD COLUMN `employment_status` text NOT NULL DEFAULT 'inactive'
  CHECK (`employment_status` IN ('active','inactive','on_leave','terminated'));
ALTER TABLE `driver_profiles` ADD COLUMN `emergency_contact_name` text;
ALTER TABLE `driver_profiles` ADD COLUMN `emergency_contact_phone` text;
ALTER TABLE `driver_profiles` ADD COLUMN `notes` text NOT NULL DEFAULT '';
ALTER TABLE `driver_profiles` ADD COLUMN `source` text NOT NULL DEFAULT 'legacy_unverified'
  CHECK (`source` IN ('manual_admin','legacy_unverified'));
CREATE INDEX `driver_profiles_operational_idx`
  ON `driver_profiles` (`source`,`employment_status`,`primary_shift`);

ALTER TABLE `vehicles` ADD COLUMN `vin` text;
ALTER TABLE `vehicles` ADD COLUMN `vehicle_type` text;
ALTER TABLE `vehicles` ADD COLUMN `registration_expires_at` text;
ALTER TABLE `vehicles` ADD COLUMN `insurance_expires_at` text;
ALTER TABLE `vehicles` ADD COLUMN `location` text;
ALTER TABLE `vehicles` ADD COLUMN `source` text NOT NULL DEFAULT 'legacy_unverified'
  CHECK (`source` IN ('manual_admin','legacy_unverified'));
CREATE UNIQUE INDEX `vehicles_vin_unique`
  ON `vehicles` (`vin`) WHERE `vin` IS NOT NULL AND trim(`vin`) <> '';
CREATE INDEX `vehicles_operational_source_idx` ON `vehicles` (`source`,`status`);

ALTER TABLE `vehicle_custodies` ADD COLUMN `source` text NOT NULL DEFAULT 'legacy_unverified'
  CHECK (`source` IN ('manual_admin','legacy_unverified'));
ALTER TABLE `vehicle_handovers` ADD COLUMN `source` text NOT NULL DEFAULT 'legacy_unverified'
  CHECK (`source` IN ('manual_admin','legacy_unverified'));
UPDATE `vehicle_custodies`
  SET `ended_at` = COALESCE(`ended_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

DROP INDEX IF EXISTS `vehicle_assignments_active_pair_unique`;
DROP INDEX IF EXISTS `vehicle_assignments_vehicle_active_idx`;
DROP INDEX IF EXISTS `vehicle_assignments_driver_history_idx`;
DROP INDEX IF EXISTS `vehicle_assignments_vehicle_history_idx`;

CREATE TABLE `vehicle_assignments_manual` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `driver_user_id` integer NOT NULL,
  `vehicle_id` integer NOT NULL,
  `assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `unassigned_at` text,
  `shift_type` text DEFAULT 'flexible' NOT NULL
    CHECK (`shift_type` IN ('morning','evening','night','flexible')),
  `valid_from` text,
  `valid_to` text,
  `assignment_type` text DEFAULT 'secondary' NOT NULL
    CHECK (`assignment_type` IN ('primary','secondary','backup')),
  `status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('active','ended')),
  `source` text DEFAULT 'manual_admin' NOT NULL
    CHECK (`source` IN ('manual_admin','legacy_unverified')),
  `assigned_by_user_id` integer NOT NULL,
  FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

INSERT INTO `vehicle_assignments_manual`
  (`id`,`driver_user_id`,`vehicle_id`,`assigned_at`,`unassigned_at`,`shift_type`,`valid_from`,`valid_to`,`assignment_type`,`status`,`source`,`assigned_by_user_id`)
SELECT `id`,`driver_user_id`,`vehicle_id`,`assigned_at`,
  COALESCE(`unassigned_at`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CASE WHEN `shift_type` IN ('morning','evening','flexible') THEN `shift_type` ELSE 'flexible' END,
  `valid_from`,COALESCE(`valid_to`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CASE WHEN `assignment_type` = 'primary' THEN 'primary' ELSE 'secondary' END,
  'ended','legacy_unverified',`assigned_by_user_id`
FROM `vehicle_assignments`;

DROP TABLE `vehicle_assignments`;
ALTER TABLE `vehicle_assignments_manual` RENAME TO `vehicle_assignments`;
CREATE UNIQUE INDEX `vehicle_assignments_active_pair_unique`
  ON `vehicle_assignments` (`vehicle_id`,`driver_user_id`) WHERE `status` = 'active';
CREATE INDEX `vehicle_assignments_driver_history_idx`
  ON `vehicle_assignments` (`driver_user_id`,`assigned_at`);
CREATE INDEX `vehicle_assignments_vehicle_history_idx`
  ON `vehicle_assignments` (`vehicle_id`,`assigned_at`);
CREATE INDEX `vehicle_assignments_vehicle_active_idx`
  ON `vehicle_assignments` (`vehicle_id`,`status`,`valid_to`,`source`);
