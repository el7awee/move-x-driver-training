import type { IdentityRole } from "../identity/core.ts";

export type OperationalUserStatus = "active" | "inactive";
export type VehicleStatus = "active" | "maintenance" | "inactive" | "retired";
export type ShiftType = "morning" | "evening" | "night" | "flexible";
export type AssignmentType = "primary" | "secondary" | "backup";
export type EmploymentStatus = "active" | "vacation" | "suspended" | "resigned" | "terminated";
export type DrivingLicenseStatus = "valid" | "expiring" | "expired" | "suspended";
export type CriminalRecordStatus = "valid" | "pending" | "expired" | "rejected" | "not_provided";
export type DrugTestStatus = "negative" | "positive" | "pending" | "expired" | "not_provided";
export type DriverDocumentType = "profile_photo" | "national_id_front" | "national_id_back" | "driving_license_front" | "driving_license_back" | "criminal_record" | "drug_test" | "employment_document" | "other";
export type VehicleDocumentType = "vehicle_license_front" | "vehicle_license_back";
export type VehicleCondition = "good" | "needs_attention" | "damaged";

export const VEHICLE_STATUSES = ["active", "maintenance", "inactive", "retired"] as const;
export const SHIFT_TYPES = ["morning", "evening", "night", "flexible"] as const;
export const ASSIGNMENT_TYPES = ["primary", "secondary", "backup"] as const;
export const EMPLOYMENT_STATUSES = ["active", "vacation", "suspended", "resigned", "terminated"] as const;
export const DRIVING_LICENSE_STATUSES = ["valid", "expiring", "expired", "suspended"] as const;
export const CRIMINAL_RECORD_STATUSES = ["valid", "pending", "expired", "rejected", "not_provided"] as const;
export const DRUG_TEST_STATUSES = ["negative", "positive", "pending", "expired", "not_provided"] as const;
export const DRIVER_DOCUMENT_TYPES = ["profile_photo", "national_id_front", "national_id_back", "driving_license_front", "driving_license_back", "criminal_record", "drug_test", "employment_document", "other"] as const;
export const VEHICLE_DOCUMENT_TYPES = ["vehicle_license_front", "vehicle_license_back"] as const;
export const VEHICLE_CONDITIONS = ["good", "needs_attention", "damaged"] as const;

export function destinationForRole(role: IdentityRole) {
  if (role === "system_admin") return "/admin";
  if (role === "supervisor") return "/supervisor";
  return "/driver";
}

export function canOpenRole(role: IdentityRole, allowed: readonly IdentityRole[]) {
  return allowed.includes(role);
}

export function normalizeOperationalStatus(status: string) {
  return status === "active" ? "active" : "suspended";
}

export function publicOperationalStatus(status: string): OperationalUserStatus {
  return status === "active" ? "active" : "inactive";
}

export function validVehicleCode(value: string) {
  return /^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(value.trim().toUpperCase());
}

export function validOptionalEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validTripsFormUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "forms.gle" || (url.hostname === "docs.google.com" && url.pathname.startsWith("/forms/")));
  } catch { return false; }
}

export function generateTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const value = btoa(String.fromCharCode(...bytes)).replaceAll("+", "A").replaceAll("/", "b").replaceAll("=", "");
  return `${value}Aa9!`;
}

export function parseVehicleInput(p: Record<string, unknown>) {
  const internalCode = String(p.internalCode ?? "").trim().toUpperCase();
  const plateNumber = String(p.plateNumber ?? "").trim().toUpperCase();
  const make = String(p.make ?? "").trim();
  const model = String(p.model ?? "").trim();
  const status = String(p.status ?? "active") as VehicleStatus;
  const vin = String(p.vin ?? "").trim().toUpperCase();
  const currentOdometer = p.currentOdometer === null || p.currentOdometer === undefined || p.currentOdometer === "" ? null : Number(p.currentOdometer);
  const modelYear = p.modelYear === null || p.modelYear === undefined || p.modelYear === "" ? null : Number(p.modelYear);
  if (!validVehicleCode(internalCode) || !plateNumber || !make || !model || !VEHICLE_STATUSES.includes(status) ||
    (vin && !/^[A-HJ-NPR-Z0-9-]{8,24}$/.test(vin)) || (currentOdometer!==null&&(!Number.isFinite(currentOdometer)||currentOdometer<0)) ||
    (modelYear !== null && (!Number.isInteger(modelYear) || modelYear < 1950 || modelYear > 2100))) {
    throw new Error("invalid_vehicle");
  }
  return { internalCode, plateNumber, make, model, modelYear,
    color: String(p.color ?? "").trim() || null, vin: vin || null, engineNumber: optionalText(p.engineNumber,80),
    fuelType: optionalText(p.fuelType,40), currentOdometer, vehicleLicenseNumber: optionalText(p.vehicleLicenseNumber,80),
    vehicleType: optionalText(p.vehicleType, 80), registrationExpiresAt: optionalDate(p.registrationExpiresAt, "invalid_vehicle"),
    ownerName: optionalText(p.ownerName, 200), trafficDepartment: optionalText(p.trafficDepartment, 120), trafficUnit: optionalText(p.trafficUnit, 120),
    licenseIssueDate: optionalDate(p.licenseIssueDate, "invalid_vehicle"), taxExpiresAt: optionalDate(p.taxExpiresAt, "invalid_vehicle"),
    technicalInspectionDue: optionalYearOrDate(p.technicalInspectionDue, "invalid_vehicle"), insurancePolicyNumber: optionalText(p.insurancePolicyNumber, 120),
    engineCapacityCc: optionalPositiveInteger(p.engineCapacityCc, 100, 20000, "invalid_vehicle"), cylinderCount: optionalPositiveInteger(p.cylinderCount, 1, 24, "invalid_vehicle"),
    legalRestrictions: optionalText(p.legalRestrictions, 500), insuranceExpiresAt: optionalDate(p.insuranceExpiresAt, "invalid_vehicle"),
    insuranceCompany: optionalText(p.insuranceCompany,160), location: optionalText(p.location, 160), status,
    notes: String(p.notes ?? "").trim().slice(0, 2000) };
}

function optionalPositiveInteger(value: unknown, minimum: number, maximum: number, error: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(error);
  return number;
}

function optionalYearOrDate(value: unknown, error: string) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}$/.test(text)) { const year=Number(text);if(year>=1950&&year<=2100)return text;throw new Error(error); }
  return optionalDate(text,error);
}

function optionalText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max) || null;
}

function optionalDate(value: unknown, error: string) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).valueOf())) throw new Error(error);
  return text;
}

export function parseDriverInput(p: Record<string, unknown>) {
  const driverCode = String(p.driverCode ?? p.loginCode ?? "").trim().toUpperCase();
  const fullName = String(p.fullName ?? p.displayName ?? "").trim();
  const phone = String(p.phone ?? "").trim();
  const email = String(p.email ?? "").trim();
  const primaryShift = String(p.primaryShift ?? "flexible") as ShiftType;
  const employmentStatus = String(p.employmentStatus ?? "active") as EmploymentStatus;
  const nationalId = String(p.nationalId ?? "").trim();
  const drivingLicenseStatus = String(p.drivingLicenseStatus ?? "expired") as DrivingLicenseStatus;
  const criminalRecordStatus = String(p.criminalRecordStatus ?? "not_provided") as CriminalRecordStatus;
  const drugTestStatus = String(p.drugTestStatus ?? "not_provided") as DrugTestStatus;
  const secondaryPhone = String(p.secondaryPhone ?? "").trim();
  if (!/^[A-Z0-9_-]{3,24}$/.test(driverCode) || !fullName || fullName.length > 160 || !/^\+?[0-9 ()-]{7,24}$/.test(phone) ||
    !validOptionalEmail(email) || !SHIFT_TYPES.includes(primaryShift) || !EMPLOYMENT_STATUSES.includes(employmentStatus) ||
    !DRIVING_LICENSE_STATUSES.includes(drivingLicenseStatus) || !CRIMINAL_RECORD_STATUSES.includes(criminalRecordStatus) || !DRUG_TEST_STATUSES.includes(drugTestStatus) ||
    (nationalId && !/^[0-9]{8,20}$/.test(nationalId)) || (secondaryPhone && !/^\+?[0-9 ()-]{7,24}$/.test(secondaryPhone))) throw new Error("invalid_driver_profile");
  return {
    driverCode, fullName, phone, email: email || null, nationalId: nationalId || null,
    secondaryPhone: secondaryPhone || null, dateOfBirth: optionalDate(p.dateOfBirth, "invalid_driver_profile"), address: optionalText(p.address, 500),
    branchOrLocation: optionalText(p.branchOrLocation ?? p.location, 160),
    drivingLicenseNumber: optionalText(p.drivingLicenseNumber ?? p.licenseNumber, 80), drivingLicenseType: optionalText(p.drivingLicenseType ?? p.licenseType, 80),
    drivingLicenseIssueDate: optionalDate(p.drivingLicenseIssueDate ?? p.licenseIssuedAt, "invalid_driver_profile"),
    drivingLicenseExpiry: optionalDate(p.drivingLicenseExpiry ?? p.licenseExpiresAt, "invalid_driver_profile"), drivingLicenseStatus,
    drivingLicenseNotes: String(p.drivingLicenseNotes ?? "").trim().slice(0, 2000),
    criminalRecordStatus, criminalRecordIssueDate: optionalDate(p.criminalRecordIssueDate, "invalid_driver_profile"),
    criminalRecordExpiry: optionalDate(p.criminalRecordExpiry, "invalid_driver_profile"), criminalRecordReference: optionalText(p.criminalRecordReference, 160),
    criminalRecordNotes: String(p.criminalRecordNotes ?? "").trim().slice(0, 2000),
    drugTestStatus, drugTestDate: optionalDate(p.drugTestDate, "invalid_driver_profile"), drugTestExpiry: optionalDate(p.drugTestExpiry ?? p.nextTestDue, "invalid_driver_profile"),
    drugTestLab: optionalText(p.drugTestLab, 160), drugTestReference: optionalText(p.drugTestReference, 160), drugTestNotes: String(p.drugTestNotes ?? "").trim().slice(0, 2000),
    hireDate: optionalDate(p.hireDate, "invalid_driver_profile"), primaryShift,
    employmentStatus, emergencyContactName: optionalText(p.emergencyContactName, 160),
    emergencyContactPhone: optionalText(p.emergencyContactPhone, 24), notes: String(p.notes ?? "").trim().slice(0, 2000),
  };
}

function optionalIso(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error("invalid_assignment");
  return parsed.toISOString();
}

export function parseDriverAuthorization(p: Record<string, unknown>) {
  const driverUserId = Number(p.driverUserId);
  const shiftType = String(p.shiftType ?? "flexible") as ShiftType;
  const assignmentType = String(p.assignmentType ?? "secondary") as AssignmentType;
  const validFrom = optionalIso(p.validFrom) ?? new Date().toISOString();
  const validTo = optionalIso(p.validTo);
  if (!Number.isInteger(driverUserId) || driverUserId < 1 || !SHIFT_TYPES.includes(shiftType) ||
    !ASSIGNMENT_TYPES.includes(assignmentType) || (validTo !== null && validTo <= validFrom)) {
    throw new Error("invalid_assignment");
  }
  return { driverUserId, shiftType, assignmentType, validFrom, validTo };
}

export function parseHandoverInput(p: Record<string, unknown>) {
  const vehicleId = Number(p.vehicleId);
  const toDriverUserId = Number(p.toDriverUserId);
  const odometer = p.odometer === null || p.odometer === undefined || p.odometer === "" ? null : Number(p.odometer);
  const fuelLevel = p.fuelLevel === null || p.fuelLevel === undefined || p.fuelLevel === "" ? null : Number(p.fuelLevel);
  const vehicleCondition = String(p.vehicleCondition ?? "good") as VehicleCondition;
  if (!Number.isInteger(vehicleId) || vehicleId < 1 || !Number.isInteger(toDriverUserId) || toDriverUserId < 1 ||
    (odometer !== null && (!Number.isFinite(odometer) || odometer < 0)) ||
    (fuelLevel !== null && (!Number.isInteger(fuelLevel) || fuelLevel < 0 || fuelLevel > 100)) ||
    !VEHICLE_CONDITIONS.includes(vehicleCondition)) throw new Error("invalid_handover");
  return {
    vehicleId, toDriverUserId, odometer, fuelLevel, vehicleCondition,
    fuelNote: String(p.fuelNote ?? "").trim().slice(0, 500),
    faultNotes: String(p.faultNotes ?? "").trim().slice(0, 2000),
    generalNotes: String(p.generalNotes ?? "").trim().slice(0, 2000),
  };
}
