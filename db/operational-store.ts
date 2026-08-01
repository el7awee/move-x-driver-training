import type { IdentityRole } from "../lib/identity/core.ts";
import { publicOperationalStatus, type VehicleStatus } from "../lib/operational/core.ts";

interface Statement { bind(...values: unknown[]): Statement; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null>; run(): Promise<{ meta?: { changes?: number } }>; }
interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]>; }

export interface OperationalUserInput {
  loginCode: string; displayName: string; email: string | null; phone: string | null;
  role: IdentityRole; status: "active" | "suspended"; passwordHash?: string;
}

export interface VehicleInput {
  internalCode: string; plateNumber: string; make: string; model: string;
  modelYear: number | null; color: string | null; status: VehicleStatus; notes: string;
}

export class OperationalStore {
  private readonly db: Database;
  constructor(db: Database) { this.db = db; }

  async writeAudit(actorUserId: number, action: string, entityType: string, entityId: string, result = "success", metadata = {}) {
    await this.db.prepare(`INSERT INTO audit_logs (actor_user_id, action, module_key, entity_type, entity_id, result, metadata_json)
      VALUES (?, ?, 'operational_admin', ?, ?, ?, ?)`).bind(actorUserId, action, entityType, entityId, result, JSON.stringify(metadata)).run();
  }

  async summary() {
    return this.db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role='driver' AND status='active') AS drivers,
      (SELECT COUNT(*) FROM users WHERE role='supervisor' AND status='active') AS supervisors,
      (SELECT COUNT(*) FROM vehicles WHERE status!='retired') AS vehicles,
      (SELECT COUNT(*) FROM vehicle_assignments WHERE status='active' AND unassigned_at IS NULL) AS assignments`).first<Record<string, number>>();
  }

  async listUsers(search = "", role = "", status = "") {
    const term = `%${search.trim()}%`;
    const storedStatus = status === "inactive" ? "suspended" : status;
    const rows = await this.db.prepare(`SELECT id, login_code, display_name, email, phone, role, status, must_change_password, created_at, updated_at
      FROM users WHERE (?='' OR display_name LIKE ? OR login_code LIKE ?)
      AND (?='' OR role=?) AND (?='' OR status=?) ORDER BY display_name, id`)
      .bind(search.trim(), term, term, role, role, storedStatus, storedStatus).all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      id: Number(row.id), loginCode: String(row.login_code), displayName: String(row.display_name),
      email: row.email ? String(row.email) : null, phone: row.phone ? String(row.phone) : null,
      role: String(row.role), status: publicOperationalStatus(String(row.status)),
      mustChangePassword: Boolean(row.must_change_password), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }));
  }

  async getUser(id: number) { return this.db.prepare("SELECT * FROM users WHERE id=?").bind(id).first<Record<string, unknown>>(); }
  async activeAdminCount() { const row = await this.db.prepare("SELECT COUNT(*) AS value FROM users WHERE role='system_admin' AND status='active'").first<{ value: number }>(); return Number(row?.value ?? 0); }

  async createUser(input: OperationalUserInput & { passwordHash: string }, actorUserId: number) {
    const row = await this.db.prepare(`INSERT INTO users
      (login_code, display_name, email, phone, role, password_hash, must_change_password, status, preferred_language)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ar') RETURNING id`).bind(
      input.loginCode, input.displayName, input.email, input.phone, input.role, input.passwordHash, input.status,
    ).first<{ id: number }>();
    if (!row) throw new Error("User insert returned no row");
    if (input.role === "driver") {
      await this.db.prepare("INSERT INTO driver_profiles (user_id, employee_code) VALUES (?, ?)").bind(row.id, input.loginCode).run();
    }
    await this.writeAudit(actorUserId, "user.created", "user", String(row.id), "success", { role: input.role, status: input.status });
    return Number(row.id);
  }

  async updateUser(id: number, input: OperationalUserInput, actorUserId: number) {
    const existing = await this.getUser(id);
    if (!existing) throw new Error("user_not_found");
    const removingActiveAdmin = existing.role === "system_admin" && existing.status === "active" && (input.role !== "system_admin" || input.status !== "active");
    if (removingActiveAdmin && await this.activeAdminCount() <= 1) {
      await this.writeAudit(actorUserId, "user.update_blocked", "user", String(id), "blocked", { reason: "last_system_admin" });
      throw new Error("last_system_admin");
    }
    await this.db.prepare(`UPDATE users SET login_code=?, display_name=?, email=?, phone=?, role=?, status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .bind(input.loginCode, input.displayName, input.email, input.phone, input.role, input.status, id).run();
    if (input.role === "driver") {
      await this.db.prepare(`INSERT INTO driver_profiles (user_id, employee_code) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET employee_code=excluded.employee_code, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(id, input.loginCode).run();
    }
    if (input.status !== "active") await this.revokeSessions(id);
    await this.writeAudit(actorUserId, "user.updated", "user", String(id), "success", { role: input.role, status: input.status });
  }

  async resetPassword(id: number, passwordHash: string, actorUserId: number) {
    if (!await this.getUser(id)) throw new Error("user_not_found");
    await this.db.prepare(`UPDATE users SET password_hash=?, must_change_password=1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(passwordHash, id).run();
    await this.revokeSessions(id);
    await this.writeAudit(actorUserId, "user.password_reset", "user", String(id));
  }

  async revokeSessions(userId: number) {
    await this.db.prepare("UPDATE auth_sessions SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND revoked_at IS NULL").bind(userId).run();
  }

  async listVehicles(search = "") {
    const term = `%${search.trim()}%`;
    const rows = await this.db.prepare(`SELECT v.*, u.display_name AS driver_name, u.login_code AS driver_code
      FROM vehicles v LEFT JOIN vehicle_assignments a ON a.vehicle_id=v.id AND a.status='active' AND a.unassigned_at IS NULL
      LEFT JOIN users u ON u.id=a.driver_user_id
      WHERE (?='' OR v.internal_code LIKE ? OR v.plate_number LIKE ?) ORDER BY v.updated_at DESC`).bind(search.trim(), term, term).all<Record<string, unknown>>();
    return rows.results;
  }

  async createVehicle(input: VehicleInput, actorUserId: number) {
    const row = await this.db.prepare(`INSERT INTO vehicles (internal_code,plate_number,make,model,model_year,color,status,notes)
      VALUES (?,?,?,?,?,?,?,?) RETURNING id`).bind(input.internalCode,input.plateNumber,input.make,input.model,input.modelYear,input.color,input.status,input.notes).first<{id:number}>();
    if (!row) throw new Error("Vehicle insert returned no row");
    await this.writeAudit(actorUserId,"vehicle.created","vehicle",String(row.id),"success",{status:input.status});
    return Number(row.id);
  }

  async updateVehicle(id: number, input: VehicleInput, actorUserId: number) {
    const existing = await this.db.prepare("SELECT id FROM vehicles WHERE id=?").bind(id).first();
    if (!existing) throw new Error("vehicle_not_found");
    await this.db.prepare(`UPDATE vehicles SET internal_code=?,plate_number=?,make=?,model=?,model_year=?,color=?,status=?,notes=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .bind(input.internalCode,input.plateNumber,input.make,input.model,input.modelYear,input.color,input.status,input.notes,id).run();
    if (input.status === "retired") await this.unassignVehicle(id, actorUserId);
    await this.writeAudit(actorUserId,"vehicle.updated","vehicle",String(id),"success",{status:input.status});
  }

  async listAssignments() {
    const rows = await this.db.prepare(`SELECT a.id,a.driver_user_id,a.vehicle_id,a.assigned_at,a.unassigned_at,a.status,
      u.display_name AS driver_name,u.login_code AS driver_code,v.internal_code,v.plate_number
      FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id JOIN vehicles v ON v.id=a.vehicle_id ORDER BY a.assigned_at DESC`).all<Record<string,unknown>>();
    return rows.results;
  }

  async assignVehicle(driverUserId: number, vehicleId: number, actorUserId: number) {
    const driver = await this.db.prepare("SELECT id FROM users WHERE id=? AND role='driver' AND status='active'").bind(driverUserId).first();
    if (!driver) throw new Error("invalid_driver");
    const vehicle = await this.db.prepare("SELECT id FROM vehicles WHERE id=? AND status='active'").bind(vehicleId).first();
    if (!vehicle) throw new Error("vehicle_not_assignable");
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare("UPDATE vehicle_assignments SET status='ended',unassigned_at=? WHERE status='active' AND unassigned_at IS NULL AND (driver_user_id=? OR vehicle_id=?)").bind(now,driverUserId,vehicleId),
      this.db.prepare("INSERT INTO vehicle_assignments (driver_user_id,vehicle_id,assigned_at,status,assigned_by_user_id) VALUES (?,?,?,'active',?)").bind(driverUserId,vehicleId,now,actorUserId),
    ]);
    await this.writeAudit(actorUserId,"vehicle.assigned","vehicle_assignment",`${driverUserId}:${vehicleId}`);
  }

  async unassignVehicle(vehicleId: number, actorUserId: number) {
    await this.db.prepare("UPDATE vehicle_assignments SET status='ended',unassigned_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE vehicle_id=? AND status='active' AND unassigned_at IS NULL").bind(vehicleId).run();
    await this.writeAudit(actorUserId,"vehicle.unassigned","vehicle",String(vehicleId));
  }

  async driverOverview(userId: number) {
    return this.db.prepare(`SELECT u.id,u.login_code,u.display_name,u.status,v.internal_code,v.plate_number,v.make,v.model
      FROM users u LEFT JOIN vehicle_assignments a ON a.driver_user_id=u.id AND a.status='active' AND a.unassigned_at IS NULL
      LEFT JOIN vehicles v ON v.id=a.vehicle_id WHERE u.id=?`).bind(userId).first<Record<string,unknown>>();
  }

  async activeDriversWithVehicles() {
    const rows = await this.db.prepare(`SELECT u.id,u.login_code,u.display_name,v.internal_code,v.plate_number
      FROM users u LEFT JOIN vehicle_assignments a ON a.driver_user_id=u.id AND a.status='active' AND a.unassigned_at IS NULL
      LEFT JOIN vehicles v ON v.id=a.vehicle_id WHERE u.role='driver' AND u.status='active' ORDER BY u.display_name`).all<Record<string,unknown>>();
    return rows.results;
  }

  async audit(limit = 100) {
    const rows = await this.db.prepare(`SELECT l.id,l.action,l.entity_type,l.entity_id,l.result,l.created_at,u.display_name AS actor_name
      FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id WHERE l.module_key='operational_admin' ORDER BY l.id DESC LIMIT ?`).bind(limit).all<Record<string,unknown>>();
    return rows.results;
  }

  async settings() { const rows=await this.db.prepare("SELECT key,value FROM system_settings ORDER BY key").all<{key:string,value:string}>(); return Object.fromEntries(rows.results.map(x=>[x.key,x.value])); }
  async updateSettings(values: Record<string,string>, actorUserId: number) {
    const allowed=["company_name","default_language","timezone","trips_form_url","show_trips_button"];
    await this.db.batch(allowed.map(key=>this.db.prepare(`INSERT INTO system_settings (key,value,updated_by_user_id,updated_at) VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by_user_id=excluded.updated_by_user_id,updated_at=excluded.updated_at`).bind(key,values[key]??"",actorUserId)));
    await this.writeAudit(actorUserId,"settings.updated","system_settings","global");
  }
}
