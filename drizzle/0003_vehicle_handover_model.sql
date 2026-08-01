DROP INDEX IF EXISTS `vehicle_assignments_active_driver_unique`;
DROP INDEX IF EXISTS `vehicle_assignments_active_vehicle_unique`;

ALTER TABLE `vehicle_assignments` ADD COLUMN `shift_type` text DEFAULT 'flexible' NOT NULL
  CHECK (`shift_type` IN ('morning','evening','alternate','flexible'));
ALTER TABLE `vehicle_assignments` ADD COLUMN `valid_from` text;
ALTER TABLE `vehicle_assignments` ADD COLUMN `valid_to` text;
ALTER TABLE `vehicle_assignments` ADD COLUMN `assignment_type` text DEFAULT 'regular' NOT NULL
  CHECK (`assignment_type` IN ('primary','regular','replacement'));

UPDATE `vehicle_assignments`
SET `valid_from` = `assigned_at`,
    `valid_to` = `unassigned_at`,
    `assignment_type` = CASE WHEN `status` = 'active' THEN 'primary' ELSE 'regular' END;

CREATE UNIQUE INDEX `vehicle_assignments_active_pair_unique`
  ON `vehicle_assignments` (`vehicle_id`,`driver_user_id`)
  WHERE `status` = 'active';
CREATE INDEX `vehicle_assignments_vehicle_active_idx`
  ON `vehicle_assignments` (`vehicle_id`,`status`,`valid_to`);

CREATE TABLE `vehicle_custodies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `vehicle_id` integer NOT NULL,
  `driver_user_id` integer NOT NULL,
  `started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `ended_at` text,
  `opened_by_user_id` integer NOT NULL,
  `closed_by_user_id` integer,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `vehicle_custodies_open_vehicle_unique`
  ON `vehicle_custodies` (`vehicle_id`) WHERE `ended_at` IS NULL;
CREATE INDEX `vehicle_custodies_driver_history_idx`
  ON `vehicle_custodies` (`driver_user_id`,`started_at`);

CREATE TABLE `vehicle_handovers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `vehicle_id` integer NOT NULL,
  `from_driver_user_id` integer,
  `to_driver_user_id` integer NOT NULL,
  `handed_over_at` text NOT NULL,
  `received_at` text NOT NULL,
  `odometer` real,
  `fuel_level` integer CHECK (`fuel_level` IS NULL OR (`fuel_level` >= 0 AND `fuel_level` <= 100)),
  `fuel_note` text NOT NULL DEFAULT '',
  `vehicle_condition` text NOT NULL DEFAULT 'good'
    CHECK (`vehicle_condition` IN ('good','needs_attention','damaged')),
  `fault_notes` text NOT NULL DEFAULT '',
  `general_notes` text NOT NULL DEFAULT '',
  `created_by` integer NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`from_driver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`to_driver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `vehicle_handovers_vehicle_history_idx`
  ON `vehicle_handovers` (`vehicle_id`,`handed_over_at`);
CREATE INDEX `vehicle_handovers_driver_history_idx`
  ON `vehicle_handovers` (`to_driver_user_id`,`received_at`);
