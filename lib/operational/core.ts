import type { IdentityRole } from "../identity/core.ts";

export type OperationalUserStatus = "active" | "inactive";
export type VehicleStatus = "active" | "maintenance" | "inactive" | "retired";

export const VEHICLE_STATUSES = ["active", "maintenance", "inactive", "retired"] as const;

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
  const modelYear = p.modelYear === null || p.modelYear === "" ? null : Number(p.modelYear);
  if (!validVehicleCode(internalCode) || !plateNumber || !make || !model || !VEHICLE_STATUSES.includes(status) ||
    (modelYear !== null && (!Number.isInteger(modelYear) || modelYear < 1950 || modelYear > 2100))) {
    throw new Error("invalid_vehicle");
  }
  return { internalCode, plateNumber, make, model, modelYear,
    color: String(p.color ?? "").trim() || null, status,
    notes: String(p.notes ?? "").trim().slice(0, 2000) };
}
