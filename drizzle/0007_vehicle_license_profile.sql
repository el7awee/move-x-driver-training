ALTER TABLE `vehicles` ADD COLUMN `owner_name` text;
ALTER TABLE `vehicles` ADD COLUMN `traffic_department` text;
ALTER TABLE `vehicles` ADD COLUMN `traffic_unit` text;
ALTER TABLE `vehicles` ADD COLUMN `license_issue_date` text;
ALTER TABLE `vehicles` ADD COLUMN `tax_expires_at` text;
ALTER TABLE `vehicles` ADD COLUMN `technical_inspection_due` text;
ALTER TABLE `vehicles` ADD COLUMN `insurance_policy_number` text;
ALTER TABLE `vehicles` ADD COLUMN `engine_capacity_cc` integer
  CHECK (`engine_capacity_cc` IS NULL OR `engine_capacity_cc` > 0);
ALTER TABLE `vehicles` ADD COLUMN `cylinder_count` integer
  CHECK (`cylinder_count` IS NULL OR (`cylinder_count` > 0 AND `cylinder_count` <= 24));
ALTER TABLE `vehicles` ADD COLUMN `legal_restrictions` text;

CREATE TABLE `vehicle_documents` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `vehicle_id` integer NOT NULL,
  `document_type` text NOT NULL CHECK (`document_type` IN ('vehicle_license_front','vehicle_license_back')),
  `original_filename` text NOT NULL,
  `mime_type` text NOT NULL,
  `file_size` integer NOT NULL CHECK (`file_size` > 0),
  `storage_provider` text NOT NULL CHECK (`storage_provider` IN ('google_drive','r2')),
  `storage_file_id` text,
  `storage_key` text,
  `verification_status` text NOT NULL DEFAULT 'pending'
    CHECK (`verification_status` IN ('pending','verified','rejected')),
  `verified_by` integer,
  `verified_at` text,
  `rejection_reason` text,
  `uploaded_by` integer NOT NULL,
  `uploaded_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  `archived_at` text,
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE INDEX `vehicle_documents_vehicle_idx`
  ON `vehicle_documents` (`vehicle_id`,`archived_at`,`document_type`);
CREATE UNIQUE INDEX `vehicle_documents_storage_file_unique`
  ON `vehicle_documents` (`storage_provider`,`storage_file_id`);
