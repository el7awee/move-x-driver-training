ALTER TABLE `vehicles` ADD COLUMN `engine_number` text;
ALTER TABLE `vehicles` ADD COLUMN `fuel_type` text;
ALTER TABLE `vehicles` ADD COLUMN `current_odometer` real
  CHECK (`current_odometer` IS NULL OR `current_odometer` >= 0);
ALTER TABLE `vehicles` ADD COLUMN `vehicle_license_number` text;
ALTER TABLE `vehicles` ADD COLUMN `insurance_company` text;
CREATE INDEX `vehicles_location_status_idx` ON `vehicles` (`location`,`status`,`source`);
