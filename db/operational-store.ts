import type { IdentityRole } from "../lib/identity/core.ts";
import { publicOperationalStatus, type AssignmentType, type ShiftType, type VehicleCondition, type VehicleStatus } from "../lib/operational/core.ts";

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

export interface DriverAuthorizationInput {
  driverUserId: number; shiftType: ShiftType; assignmentType: AssignmentType;
  validFrom: string; validTo: string | null;
}

export interface VehicleHandoverInput {
  vehicleId: number; toDriverUserId: number; odometer: number | null; fuelLevel: number | null;
  fuelNote: string; vehicleCondition: VehicleCondition; faultNotes: string; generalNotes: string;
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
      (SELECT COUNT(*) FROM vehicle_assignments WHERE status='active' AND (valid_from IS NULL OR valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND (valid_to IS NULL OR valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS assignments`).first<Record<string, number>>();
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
    if (input.status !== "active" || input.role !== "driver") {
      const now = new Date().toISOString();
      await this.revokeSessions(id);
      await this.db.batch([
        this.db.prepare("UPDATE vehicle_assignments SET status='ended',valid_to=?,unassigned_at=? WHERE driver_user_id=? AND status='active'").bind(now,now,id),
        this.db.prepare("UPDATE vehicle_custodies SET ended_at=?,closed_by_user_id=? WHERE driver_user_id=? AND ended_at IS NULL").bind(now,actorUserId,id),
      ]);
    }
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
    const rows = await this.db.prepare(`SELECT v.*,
      (SELECT GROUP_CONCAT(u.display_name, '، ') FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id
       WHERE a.vehicle_id=v.id AND a.status='active' AND (a.valid_from IS NULL OR a.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND (a.valid_to IS NULL OR a.valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS authorized_driver_names,
      (SELECT u.display_name FROM vehicle_custodies c JOIN users u ON u.id=c.driver_user_id
       WHERE c.vehicle_id=v.id AND c.ended_at IS NULL LIMIT 1) AS current_driver_name,
      (SELECT c.driver_user_id FROM vehicle_custodies c WHERE c.vehicle_id=v.id AND c.ended_at IS NULL LIMIT 1) AS current_driver_user_id
      FROM vehicles v
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
    if (input.status !== "active") await this.deactivateVehicleOperations(id, actorUserId);
    await this.writeAudit(actorUserId,"vehicle.updated","vehicle",String(id),"success",{status:input.status});
  }

  async listAssignments() {
    const rows = await this.db.prepare(`SELECT a.id,a.driver_user_id,a.vehicle_id,a.assigned_at,a.unassigned_at,a.status,
      a.shift_type,a.valid_from,a.valid_to,a.assignment_type,
      CASE WHEN a.status!='active' THEN 'ended' WHEN a.valid_from>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'scheduled'
        WHEN a.valid_to IS NOT NULL AND a.valid_to<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired' ELSE 'active' END AS effective_status,
      u.display_name AS driver_name,u.login_code AS driver_code,v.internal_code,v.plate_number
      FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id JOIN vehicles v ON v.id=a.vehicle_id
      ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END,a.valid_from DESC,a.id DESC`).all<Record<string,unknown>>();
    return rows.results;
  }

  async authorizeDrivers(vehicleId: number, authorizations: DriverAuthorizationInput[], actorUserId: number) {
    if (!authorizations.length) throw new Error("invalid_assignment");
    const vehicle = await this.db.prepare("SELECT id FROM vehicles WHERE id=? AND status='active'").bind(vehicleId).first();
    if (!vehicle) throw new Error("vehicle_not_assignable");
    const uniqueDrivers = new Set(authorizations.map((item) => item.driverUserId));
    if (uniqueDrivers.size !== authorizations.length) throw new Error("invalid_assignment");
    const statements: Statement[] = [];
    for (const authorization of authorizations) {
      const driver = await this.db.prepare("SELECT id FROM users WHERE id=? AND role='driver' AND status='active'").bind(authorization.driverUserId).first();
      if (!driver) throw new Error("invalid_driver");
      const existing = await this.db.prepare("SELECT id FROM vehicle_assignments WHERE vehicle_id=? AND driver_user_id=? AND status='active'")
        .bind(vehicleId, authorization.driverUserId).first<{id:number}>();
      if (existing) {
        statements.push(this.db.prepare(`UPDATE vehicle_assignments SET shift_type=?,valid_from=?,valid_to=?,assignment_type=?
          WHERE id=?`).bind(authorization.shiftType,authorization.validFrom,authorization.validTo,authorization.assignmentType,existing.id));
      } else {
        statements.push(this.db.prepare(`INSERT INTO vehicle_assignments
          (driver_user_id,vehicle_id,assigned_at,unassigned_at,shift_type,valid_from,valid_to,assignment_type,status,assigned_by_user_id)
          VALUES (?,?,?,NULL,?,?,?,?, 'active',?)`).bind(authorization.driverUserId,vehicleId,authorization.validFrom,authorization.shiftType,authorization.validFrom,authorization.validTo,authorization.assignmentType,actorUserId));
      }
    }
    await this.db.batch(statements);
    await this.writeAudit(actorUserId,"vehicle.drivers_authorized","vehicle",String(vehicleId),"success",{
      drivers: authorizations.map(({driverUserId,shiftType,assignmentType})=>({driverUserId,shiftType,assignmentType})),
    });
  }

  async endAuthorization(assignmentId: number, actorUserId: number) {
    const assignment = await this.db.prepare("SELECT id,vehicle_id,driver_user_id FROM vehicle_assignments WHERE id=? AND status='active'").bind(assignmentId).first<Record<string,unknown>>();
    if (!assignment) throw new Error("assignment_not_found");
    const custody = await this.db.prepare("SELECT id FROM vehicle_custodies WHERE vehicle_id=? AND driver_user_id=? AND ended_at IS NULL")
      .bind(assignment.vehicle_id,assignment.driver_user_id).first();
    if (custody) throw new Error("assignment_in_use");
    const now = new Date().toISOString();
    await this.db.prepare("UPDATE vehicle_assignments SET status='ended',valid_to=?,unassigned_at=? WHERE id=?").bind(now,now,assignmentId).run();
    await this.writeAudit(actorUserId,"vehicle.driver_authorization_ended","vehicle_assignment",String(assignmentId));
  }

  async deactivateVehicleOperations(vehicleId: number, actorUserId: number) {
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare("UPDATE vehicle_assignments SET status='ended',valid_to=?,unassigned_at=? WHERE vehicle_id=? AND status='active'").bind(now,now,vehicleId),
      this.db.prepare("UPDATE vehicle_custodies SET ended_at=?,closed_by_user_id=? WHERE vehicle_id=? AND ended_at IS NULL").bind(now,actorUserId,vehicleId),
    ]);
    await this.writeAudit(actorUserId,"vehicle.operations_deactivated","vehicle",String(vehicleId));
  }

  async handoverVehicle(input: VehicleHandoverInput, actorUserId: number) {
    const now = new Date().toISOString();
    const vehicle = await this.db.prepare("SELECT id,status FROM vehicles WHERE id=?").bind(input.vehicleId).first<Record<string,unknown>>();
    if (!vehicle) throw new Error("vehicle_not_found");
    if (vehicle.status !== "active") throw new Error("vehicle_not_handoverable");
    const recipient = await this.db.prepare(`SELECT a.id FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id
      WHERE a.vehicle_id=? AND a.driver_user_id=? AND a.status='active'
      AND (a.valid_from IS NULL OR a.valid_from<=?) AND (a.valid_to IS NULL OR a.valid_to>?)
      AND u.role='driver' AND u.status='active' LIMIT 1`)
      .bind(input.vehicleId,input.toDriverUserId,now,now).first();
    if (!recipient) throw new Error("recipient_not_authorized");
    const current = await this.db.prepare("SELECT id,driver_user_id FROM vehicle_custodies WHERE vehicle_id=? AND ended_at IS NULL")
      .bind(input.vehicleId).first<Record<string,unknown>>();
    if (current && Number(current.driver_user_id) === input.toDriverUserId) throw new Error("driver_already_has_custody");
    const fromDriverUserId = current ? Number(current.driver_user_id) : null;
    const statements: Statement[] = [];
    if (current) statements.push(this.db.prepare("UPDATE vehicle_custodies SET ended_at=?,closed_by_user_id=? WHERE id=? AND ended_at IS NULL").bind(now,actorUserId,current.id));
    statements.push(
      this.db.prepare(`INSERT INTO vehicle_handovers
        (vehicle_id,from_driver_user_id,to_driver_user_id,handed_over_at,received_at,odometer,fuel_level,fuel_note,vehicle_condition,fault_notes,general_notes,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(input.vehicleId,fromDriverUserId,input.toDriverUserId,now,now,input.odometer,input.fuelLevel,input.fuelNote,input.vehicleCondition,input.faultNotes,input.generalNotes,actorUserId),
      this.db.prepare("INSERT INTO vehicle_custodies (vehicle_id,driver_user_id,started_at,opened_by_user_id) VALUES (?,?,?,?)").bind(input.vehicleId,input.toDriverUserId,now,actorUserId),
      this.db.prepare(`INSERT INTO audit_logs (actor_user_id,action,module_key,entity_type,entity_id,result,metadata_json)
        VALUES (?,'vehicle.handed_over','operational_admin','vehicle',?,'success',?)`).bind(actorUserId,String(input.vehicleId),JSON.stringify({fromDriverUserId,toDriverUserId:input.toDriverUserId})),
    );
    await this.db.batch(statements);
  }

  async listHandovers(vehicleId?: number) {
    const rows = await this.db.prepare(`SELECT h.*,v.internal_code,v.plate_number,
      from_user.display_name AS from_driver_name,to_user.display_name AS to_driver_name,actor.display_name AS created_by_name
      FROM vehicle_handovers h JOIN vehicles v ON v.id=h.vehicle_id
      LEFT JOIN users from_user ON from_user.id=h.from_driver_user_id
      JOIN users to_user ON to_user.id=h.to_driver_user_id JOIN users actor ON actor.id=h.created_by
      WHERE (? IS NULL OR h.vehicle_id=?) ORDER BY h.handed_over_at DESC,h.id DESC`)
      .bind(vehicleId??null,vehicleId??null).all<Record<string,unknown>>();
    return rows.results;
  }

  async driverOverview(userId: number) {
    const user = await this.db.prepare("SELECT id,login_code,display_name,status FROM users WHERE id=?").bind(userId).first<Record<string,unknown>>();
    const assignments = await this.db.prepare(`SELECT a.id,a.shift_type,a.assignment_type,a.valid_from,a.valid_to,
      v.id AS vehicle_id,v.internal_code,v.plate_number,v.make,v.model,
      CASE WHEN c.driver_user_id=? THEN 1 ELSE 0 END AS has_custody,
      current_user.display_name AS current_driver_name
      FROM vehicle_assignments a JOIN vehicles v ON v.id=a.vehicle_id
      LEFT JOIN vehicle_custodies c ON c.vehicle_id=v.id AND c.ended_at IS NULL
      LEFT JOIN users current_user ON current_user.id=c.driver_user_id
      WHERE a.driver_user_id=? AND a.status='active'
      AND (a.valid_from IS NULL OR a.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND (a.valid_to IS NULL OR a.valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now')) ORDER BY a.assignment_type,a.valid_from`)
      .bind(userId,userId).all<Record<string,unknown>>();
    const handovers = await this.db.prepare(`SELECT h.id,h.vehicle_id,h.handed_over_at,h.received_at,
      v.internal_code,from_user.display_name AS from_driver_name,to_user.display_name AS to_driver_name,
      CASE WHEN h.to_driver_user_id=? THEN 'received' ELSE 'delivered' END AS direction
      FROM vehicle_handovers h JOIN vehicles v ON v.id=h.vehicle_id
      LEFT JOIN users from_user ON from_user.id=h.from_driver_user_id JOIN users to_user ON to_user.id=h.to_driver_user_id
      WHERE h.from_driver_user_id=? OR h.to_driver_user_id=? ORDER BY h.handed_over_at DESC LIMIT 10`)
      .bind(userId,userId,userId).all<Record<string,unknown>>();
    return {user,assignments:assignments.results,handovers:handovers.results};
  }

  async vehicleOperationsOverview() {
    const rows = await this.db.prepare(`SELECT v.id,v.internal_code,v.plate_number,v.status,
      (SELECT GROUP_CONCAT(u.display_name || ' (' || a.shift_type || ')', '، ')
       FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id
       WHERE a.vehicle_id=v.id AND a.status='active'
       AND (a.valid_from IS NULL OR a.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       AND (a.valid_to IS NULL OR a.valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS authorized_drivers,
      (SELECT u.display_name FROM vehicle_custodies c JOIN users u ON u.id=c.driver_user_id
       WHERE c.vehicle_id=v.id AND c.ended_at IS NULL LIMIT 1) AS current_driver_name,
      (SELECT COALESCE(f.display_name,'بداية التشغيل') || ' ← ' || t.display_name || ' — ' || h.received_at
       FROM vehicle_handovers h LEFT JOIN users f ON f.id=h.from_driver_user_id JOIN users t ON t.id=h.to_driver_user_id
       WHERE h.vehicle_id=v.id ORDER BY h.handed_over_at DESC,h.id DESC LIMIT 1) AS last_handover
      FROM vehicles v WHERE v.status!='retired' ORDER BY v.internal_code`).all<Record<string,unknown>>();
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
