CREATE TABLE `driver_profiles_next` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `employee_code` text NOT NULL,
  `profile_photo_document_id` integer,
  `secondary_phone` text,
  `date_of_birth` text,
  `address` text,
  `branch_or_location` text,
  `hire_date` text,
  `primary_shift` text NOT NULL DEFAULT 'flexible' CHECK (`primary_shift` IN ('morning','evening','night','flexible')),
  `employment_status` text NOT NULL DEFAULT 'active' CHECK (`employment_status` IN ('active','vacation','suspended','resigned','terminated')),
  `emergency_contact_name` text,
  `emergency_contact_phone` text,
  `notes` text NOT NULL DEFAULT '',
  `national_id_encrypted` text,
  `national_id_hash` text,
  `national_id_last4` text,
  `driving_license_number` text,
  `driving_license_type` text,
  `driving_license_issue_date` text,
  `driving_license_expiry` text,
  `driving_license_status` text NOT NULL DEFAULT 'expired' CHECK (`driving_license_status` IN ('valid','expiring','expired','suspended')),
  `driving_license_notes` text NOT NULL DEFAULT '',
  `criminal_record_status` text NOT NULL DEFAULT 'not_provided' CHECK (`criminal_record_status` IN ('valid','pending','expired','rejected','not_provided')),
  `criminal_record_issue_date` text,
  `criminal_record_expiry` text,
  `criminal_record_reference` text,
  `criminal_record_notes` text NOT NULL DEFAULT '',
  `drug_test_status` text NOT NULL DEFAULT 'not_provided' CHECK (`drug_test_status` IN ('negative','positive','pending','expired','not_provided')),
  `drug_test_date` text,
  `drug_test_expiry` text,
  `drug_test_lab` text,
  `drug_test_reference` text,
  `drug_test_notes` text NOT NULL DEFAULT '',
  `source` text NOT NULL DEFAULT 'legacy_unverified' CHECK (`source` IN ('manual_admin','legacy_unverified')),
  `created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  `updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

INSERT INTO `driver_profiles_next` (
  `id`,`user_id`,`employee_code`,`hire_date`,`primary_shift`,`employment_status`,
  `branch_or_location`,`emergency_contact_name`,`emergency_contact_phone`,`notes`,
  `national_id_hash`,`national_id_last4`,`driving_license_number`,`driving_license_type`,
  `driving_license_issue_date`,`driving_license_expiry`,`source`,`created_at`,`updated_at`
)
SELECT `id`,`user_id`,`employee_code`,`hire_date`,`primary_shift`,
  CASE `employment_status` WHEN 'on_leave' THEN 'vacation' WHEN 'inactive' THEN 'suspended' ELSE `employment_status` END,
  `location`,`emergency_contact_name`,`emergency_contact_phone`,`notes`,
  `national_id_hash`,`national_id_last4`,`license_number`,`license_type`,
  `license_issued_at`,`license_expires_at`,`source`,`created_at`,`updated_at`
FROM `driver_profiles`;

DROP TABLE `driver_profiles`;
ALTER TABLE `driver_profiles_next` RENAME TO `driver_profiles`;
CREATE UNIQUE INDEX `driver_profiles_user_unique` ON `driver_profiles` (`user_id`);
CREATE UNIQUE INDEX `driver_profiles_employee_code_unique` ON `driver_profiles` (`employee_code`);
CREATE UNIQUE INDEX `driver_profiles_national_id_hash_unique` ON `driver_profiles` (`national_id_hash`) WHERE `national_id_hash` IS NOT NULL;
CREATE INDEX `driver_profiles_operational_idx` ON `driver_profiles` (`source`,`employment_status`,`primary_shift`);
CREATE INDEX `driver_profiles_branch_idx` ON `driver_profiles` (`branch_or_location`,`employment_status`);

CREATE TABLE `driver_documents` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `driver_profile_id` integer NOT NULL,
  `document_type` text NOT NULL CHECK (`document_type` IN ('profile_photo','national_id_front','national_id_back','driving_license_front','driving_license_back','criminal_record','drug_test','employment_document','other')),
  `original_filename` text NOT NULL,
  `mime_type` text NOT NULL,
  `file_size` integer NOT NULL,
  `storage_provider` text NOT NULL CHECK (`storage_provider` IN ('google_drive','r2')),
  `storage_file_id` text,
  `storage_key` text,
  `issue_date` text,
  `expiry_date` text,
  `verification_status` text NOT NULL DEFAULT 'pending' CHECK (`verification_status` IN ('pending','verified','rejected','expired')),
  `verified_by` integer,
  `verified_at` text,
  `rejection_reason` text,
  `uploaded_by` integer NOT NULL,
  `uploaded_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  `archived_at` text,
  FOREIGN KEY (`driver_profile_id`) REFERENCES `driver_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `driver_documents_profile_idx` ON `driver_documents` (`driver_profile_id`,`archived_at`,`document_type`);
CREATE INDEX `driver_documents_expiry_idx` ON `driver_documents` (`expiry_date`,`verification_status`,`archived_at`);
CREATE UNIQUE INDEX `driver_documents_storage_file_unique` ON `driver_documents` (`storage_provider`,`storage_file_id`) WHERE `storage_file_id` IS NOT NULL;
