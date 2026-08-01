import type { IdentityRole } from "../identity/core.ts";

export type OperationalUserStatus = "active" | "inactive";
export type VehicleStatus = "active" | "maintenance" | "inactive" | "retired";
export type ShiftType = "morning" | "evening" | "alternate" | "flexible";
export type AssignmentType = "primary" | "regular" | "replacement";
export type VehicleCondition = "good" | "needs_attention" | "damaged";

export const VEHICLE_STATUSES = ["active", "maintenance", "inactive", "retired"] as const;
export const SHIFT_TYPES = ["morning", "evening", "alternate", "flexible"] as const;
export const ASSIGNMENT_TYPES = ["primary", "regular", "replacement"] as const;
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
  const modelYear = p.modelYear === null || p.modelYear === undefined || p.modelYear === "" ? null : Number(p.modelYear);
  if (!validVehicleCode(internalCode) || !plateNumber || !make || !model || !VEHICLE_STATUSES.includes(status) ||
    (modelYear !== null && (!Number.isInteger(modelYear) || modelYear < 1950 || modelYear > 2100))) {
    throw new Error("invalid_vehicle");
  }
  return { internalCode, plateNumber, make, model, modelYear,
    color: String(p.color ?? "").trim() || null, status,
    notes: String(p.notes ?? "").trim().slice(0, 2000) };
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
  const assignmentType = String(p.assignmentType ?? "regular") as AssignmentType;
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
