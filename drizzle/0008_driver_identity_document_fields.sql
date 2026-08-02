ALTER TABLE `driver_profiles` ADD COLUMN `gender` text
  CHECK (`gender` IS NULL OR `gender` IN ('male','female'));
ALTER TABLE `driver_profiles` ADD COLUMN `nationality` text;
ALTER TABLE `driver_profiles` ADD COLUMN `marital_status` text
  CHECK (`marital_status` IS NULL OR `marital_status` IN ('single','married','divorced','widowed'));
ALTER TABLE `driver_profiles` ADD COLUMN `religion` text;
ALTER TABLE `driver_profiles` ADD COLUMN `occupation` text;
ALTER TABLE `driver_profiles` ADD COLUMN `national_id_expiry` text;
ALTER TABLE `driver_profiles` ADD COLUMN `national_id_card_serial` text;
ALTER TABLE `driver_profiles` ADD COLUMN `driving_license_traffic_department` text;
ALTER TABLE `driver_profiles` ADD COLUMN `driving_license_traffic_unit` text;
ALTER TABLE `driver_profiles` ADD COLUMN `driving_license_category` text;
