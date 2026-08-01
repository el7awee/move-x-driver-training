import type { IdentityRole } from "../lib/identity/core.ts";
import { publicOperationalStatus, type AssignmentType, type CriminalRecordStatus, type DriverDocumentType, type DrivingLicenseStatus, type DrugTestStatus, type EmploymentStatus, type ShiftType, type VehicleCondition, type VehicleStatus } from "../lib/operational/core.ts";

interface Statement { bind(...values: unknown[]): Statement; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null>; run(): Promise<{ meta?: { changes?: number } }>; }
interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]>; }

export interface OperationalUserInput {
  loginCode: string; displayName: string; email: string | null; phone: string | null;
  role: IdentityRole; status: "active" | "suspended"; passwordHash?: string;
}

export interface VehicleInput {
  internalCode: string; plateNumber: string; make: string; model: string;
  modelYear: number | null; color: string | null; vin: string | null; engineNumber:string|null; fuelType:string|null; currentOdometer:number|null;
  vehicleLicenseNumber:string|null; vehicleType: string | null; registrationExpiresAt: string | null; insuranceExpiresAt: string | null;
  insuranceCompany:string|null; location: string | null;
  status: VehicleStatus; notes: string;
}

export interface DriverInput {
  driverCode: string; fullName: string; phone: string; email: string | null;
  secondaryPhone: string | null; dateOfBirth: string | null; address: string | null; branchOrLocation: string | null;
  nationalIdEncrypted: string | null; nationalIdHash: string | null; nationalIdLast4: string | null;
  drivingLicenseNumber: string | null; drivingLicenseType: string | null; drivingLicenseIssueDate: string | null; drivingLicenseExpiry: string | null;
  drivingLicenseStatus: DrivingLicenseStatus; drivingLicenseNotes: string;
  criminalRecordStatus: CriminalRecordStatus; criminalRecordIssueDate: string | null; criminalRecordExpiry: string | null; criminalRecordReference: string | null; criminalRecordNotes: string;
  drugTestStatus: DrugTestStatus; drugTestDate: string | null; drugTestExpiry: string | null; drugTestLab: string | null; drugTestReference: string | null; drugTestNotes: string;
  hireDate: string | null; primaryShift: ShiftType; employmentStatus: EmploymentStatus;
  emergencyContactName: string | null; emergencyContactPhone: string | null; notes: string;
}

export interface DriverDocumentInput { driverProfileId:number; documentType:DriverDocumentType; originalFilename:string; mimeType:string; fileSize:number; storageProvider:"google_drive"|"r2"; storageFileId:string|null; storageKey:string|null; issueDate:string|null; expiryDate:string|null; verificationStatus:"pending"|"verified"|"rejected"|"expired"; }

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
      (SELECT COUNT(*) FROM users u JOIN driver_profiles p ON p.user_id=u.id WHERE u.role='driver' AND u.status='active' AND p.source='manual_admin') AS drivers,
      (SELECT COUNT(*) FROM users WHERE role='supervisor' AND status='active') AS supervisors,
      (SELECT COUNT(*) FROM vehicles WHERE status!='retired' AND source='manual_admin') AS vehicles,
      (SELECT COUNT(*) FROM vehicle_assignments WHERE status='active' AND source='manual_admin' AND (valid_from IS NULL OR valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND (valid_to IS NULL OR valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS assignments`).first<Record<string, number>>();
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
    const statements: Statement[] = [this.db.prepare(`INSERT INTO users
      (login_code, display_name, email, phone, role, password_hash, must_change_password, status, preferred_language)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'ar')`).bind(
      input.loginCode, input.displayName, input.email, input.phone, input.role, input.passwordHash, input.status,
    )];
    if (input.role === "driver") {
      statements.push(this.db.prepare(`INSERT INTO driver_profiles (user_id,employee_code,employment_status,source)
        SELECT id,?,'active','manual_admin' FROM users WHERE login_code=?`).bind(input.loginCode,input.loginCode));
    }
    statements.push(this.db.prepare(`INSERT INTO audit_logs (actor_user_id,action,module_key,entity_type,entity_id,result,metadata_json)
      SELECT ?,'user.created','operational_admin','user',CAST(id AS TEXT),'success',? FROM users WHERE login_code=?`)
      .bind(actorUserId,JSON.stringify({role:input.role,status:input.status,source:"manual_admin"}),input.loginCode));
    await this.db.batch(statements);
    const row=await this.db.prepare("SELECT id FROM users WHERE login_code=?").bind(input.loginCode).first<{id:number}>();
    if(!row)throw new Error("user_not_found");
    return Number(row.id);
  }

  async listDrivers(search="", status="", shift="", branch="", searchNationalIdHash:string|null=null) {
    const term=`%${search.trim()}%`;
    const rows=await this.db.prepare(`SELECT u.id,p.id AS driver_profile_id,u.login_code AS driver_code,u.display_name AS full_name,u.phone,u.email,u.status AS account_status,u.must_change_password,
      p.national_id_last4,p.driving_license_number,p.driving_license_type,p.driving_license_issue_date,p.driving_license_expiry,p.driving_license_status,p.hire_date,p.primary_shift,p.branch_or_location,
      p.employment_status,p.emergency_contact_name,p.emergency_contact_phone,p.notes,p.created_at,p.updated_at,
      (SELECT COUNT(*) FROM driver_documents d WHERE d.driver_profile_id=p.id AND d.archived_at IS NULL) AS document_count,
      (SELECT COUNT(*) FROM driver_documents d WHERE d.driver_profile_id=p.id AND d.archived_at IS NULL AND (d.verification_status IN ('rejected','expired') OR (d.expiry_date IS NOT NULL AND d.expiry_date<=date('now','+30 day')))) AS document_alert_count
      FROM driver_profiles p JOIN users u ON u.id=p.user_id
      WHERE p.source='manual_admin' AND (?='' OR u.display_name LIKE ? OR u.login_code LIKE ? OR u.phone LIKE ? OR p.national_id_hash=?)
      AND (?='' OR p.employment_status=?) AND (?='' OR p.primary_shift=?) AND (?='' OR p.branch_or_location LIKE ?) ORDER BY u.display_name,u.id`)
      .bind(search.trim(),term,term,term,searchNationalIdHash,status,status,shift,shift,branch.trim(),`%${branch.trim()}%`).all<Record<string,unknown>>();
    return rows.results;
  }

  async createDriver(input: DriverInput & {passwordHash:string}, actorUserId:number) {
    const accountStatus=['active','vacation'].includes(input.employmentStatus)?'active':'suspended';
    await this.db.batch([
      this.db.prepare(`INSERT INTO users(login_code,display_name,email,phone,role,password_hash,must_change_password,status,preferred_language)
        VALUES(?,?,?,?, 'driver',?,1,?,'ar')`).bind(input.driverCode,input.fullName,input.email,input.phone,input.passwordHash,accountStatus),
      this.db.prepare(`INSERT INTO driver_profiles(user_id,employee_code,secondary_phone,date_of_birth,address,branch_or_location,hire_date,primary_shift,employment_status,
        emergency_contact_name,emergency_contact_phone,notes,national_id_encrypted,national_id_hash,national_id_last4,
        driving_license_number,driving_license_type,driving_license_issue_date,driving_license_expiry,driving_license_status,driving_license_notes,
        criminal_record_status,criminal_record_issue_date,criminal_record_expiry,criminal_record_reference,criminal_record_notes,
        drug_test_status,drug_test_date,drug_test_expiry,drug_test_lab,drug_test_reference,drug_test_notes,source)
        SELECT id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'manual_admin' FROM users WHERE login_code=?`).bind(
          input.driverCode,input.secondaryPhone,input.dateOfBirth,input.address,input.branchOrLocation,input.hireDate,input.primaryShift,input.employmentStatus,
          input.emergencyContactName,input.emergencyContactPhone,input.notes,input.nationalIdEncrypted,input.nationalIdHash,input.nationalIdLast4,
          input.drivingLicenseNumber,input.drivingLicenseType,input.drivingLicenseIssueDate,input.drivingLicenseExpiry,input.drivingLicenseStatus,input.drivingLicenseNotes,
          input.criminalRecordStatus,input.criminalRecordIssueDate,input.criminalRecordExpiry,input.criminalRecordReference,input.criminalRecordNotes,
          input.drugTestStatus,input.drugTestDate,input.drugTestExpiry,input.drugTestLab,input.drugTestReference,input.drugTestNotes,input.driverCode),
      this.db.prepare(`INSERT INTO audit_logs(actor_user_id,action,module_key,entity_type,entity_id,result,metadata_json)
        SELECT ?,'driver.created','operational_admin','driver',CAST(id AS TEXT),'success',? FROM users WHERE login_code=?`)
        .bind(actorUserId,JSON.stringify({source:"manual_admin",employmentStatus:input.employmentStatus}),input.driverCode),
    ]);
    const row=await this.db.prepare("SELECT id FROM users WHERE login_code=?").bind(input.driverCode).first<{id:number}>();
    if(!row)throw new Error("user_not_found");
    return Number(row.id);
  }

  async updateDriver(id:number,input:DriverInput,actorUserId:number) {
    const existing=await this.db.prepare(`SELECT u.id,p.national_id_encrypted,p.national_id_hash,p.national_id_last4 FROM users u JOIN driver_profiles p ON p.user_id=u.id
      WHERE u.id=? AND u.role='driver' AND p.source='manual_admin'`).bind(id).first<Record<string,unknown>>();
    if(!existing)throw new Error("user_not_found");
    const accountStatus=['active','vacation'].includes(input.employmentStatus)?'active':'suspended';
    const nationalIdEncrypted=input.nationalIdEncrypted??(existing.national_id_encrypted?String(existing.national_id_encrypted):null);
    const nationalIdHash=input.nationalIdHash??(existing.national_id_hash?String(existing.national_id_hash):null);
    const nationalIdLast4=input.nationalIdLast4??(existing.national_id_last4?String(existing.national_id_last4):null);
    const statements=[
      this.db.prepare(`UPDATE users SET login_code=?,display_name=?,email=?,phone=?,status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
        .bind(input.driverCode,input.fullName,input.email,input.phone,accountStatus,id),
      this.db.prepare(`UPDATE driver_profiles SET employee_code=?,secondary_phone=?,date_of_birth=?,address=?,branch_or_location=?,hire_date=?,primary_shift=?,employment_status=?,
        emergency_contact_name=?,emergency_contact_phone=?,notes=?,national_id_encrypted=?,national_id_hash=?,national_id_last4=?,
        driving_license_number=?,driving_license_type=?,driving_license_issue_date=?,driving_license_expiry=?,driving_license_status=?,driving_license_notes=?,
        criminal_record_status=?,criminal_record_issue_date=?,criminal_record_expiry=?,criminal_record_reference=?,criminal_record_notes=?,
        drug_test_status=?,drug_test_date=?,drug_test_expiry=?,drug_test_lab=?,drug_test_reference=?,drug_test_notes=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND source='manual_admin'`)
        .bind(input.driverCode,input.secondaryPhone,input.dateOfBirth,input.address,input.branchOrLocation,input.hireDate,input.primaryShift,input.employmentStatus,
          input.emergencyContactName,input.emergencyContactPhone,input.notes,nationalIdEncrypted,nationalIdHash,nationalIdLast4,
          input.drivingLicenseNumber,input.drivingLicenseType,input.drivingLicenseIssueDate,input.drivingLicenseExpiry,input.drivingLicenseStatus,input.drivingLicenseNotes,
          input.criminalRecordStatus,input.criminalRecordIssueDate,input.criminalRecordExpiry,input.criminalRecordReference,input.criminalRecordNotes,
          input.drugTestStatus,input.drugTestDate,input.drugTestExpiry,input.drugTestLab,input.drugTestReference,input.drugTestNotes,id),
      this.db.prepare(`INSERT INTO audit_logs(actor_user_id,action,module_key,entity_type,entity_id,result,metadata_json)
        VALUES(?,'driver.updated','operational_admin','driver',?,'success',?)`).bind(actorUserId,String(id),JSON.stringify({employmentStatus:input.employmentStatus,nationalIdChanged:input.nationalIdEncrypted!==null})),
    ];
    if(accountStatus!=='active'){
      const now=new Date().toISOString();
      statements.push(this.db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(now,id));
      statements.push(this.db.prepare("UPDATE vehicle_assignments SET status='ended',valid_to=?,unassigned_at=? WHERE driver_user_id=? AND status='active'").bind(now,now,id));
      statements.push(this.db.prepare("UPDATE vehicle_custodies SET ended_at=?,closed_by_user_id=? WHERE driver_user_id=? AND ended_at IS NULL").bind(now,actorUserId,id));
    }
    await this.db.batch(statements);
  }

  async getDriverProfile(userId:number) {
    return this.db.prepare(`SELECT u.id AS user_id,p.id AS driver_profile_id,u.login_code AS driver_code,u.display_name AS full_name,u.phone,u.email,u.status AS account_status,u.must_change_password,
      p.* FROM driver_profiles p JOIN users u ON u.id=p.user_id WHERE u.id=? AND u.role='driver' AND p.source='manual_admin'`).bind(userId).first<Record<string,unknown>>();
  }

  async setDriverEmploymentStatus(userId:number,status:EmploymentStatus,actorUserId:number) {
    const profile=await this.getDriverProfile(userId);if(!profile)throw new Error("user_not_found");
    const accountStatus=['active','vacation'].includes(status)?'active':'suspended';const statements:Statement[]=[
      this.db.prepare("UPDATE driver_profiles SET employment_status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?").bind(status,userId),
      this.db.prepare("UPDATE users SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(accountStatus,userId),
    ];
    if(accountStatus==='suspended'){const now=new Date().toISOString();statements.push(this.db.prepare("UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(now,userId));statements.push(this.db.prepare("UPDATE vehicle_assignments SET status='ended',valid_to=?,unassigned_at=? WHERE driver_user_id=? AND status='active'").bind(now,now,userId));statements.push(this.db.prepare("UPDATE vehicle_custodies SET ended_at=?,closed_by_user_id=? WHERE driver_user_id=? AND ended_at IS NULL").bind(now,actorUserId,userId));}
    await this.db.batch(statements);await this.writeAudit(actorUserId,status==='active'?"driver.reactivated":"driver.status_changed","driver",String(userId),"success",{employmentStatus:status});
  }

  async listDriverDocuments(driverProfileId:number) {
    const rows=await this.db.prepare(`SELECT id,driver_profile_id,document_type,original_filename,mime_type,file_size,storage_provider,issue_date,expiry_date,verification_status,
      verified_by,verified_at,rejection_reason,uploaded_by,uploaded_at,archived_at FROM driver_documents WHERE driver_profile_id=? ORDER BY archived_at IS NOT NULL,uploaded_at DESC,id DESC`).bind(driverProfileId).all<Record<string,unknown>>();
    return rows.results;
  }

  async createDriverDocument(input:DriverDocumentInput,actorUserId:number) {
    const profile=await this.db.prepare("SELECT id,user_id FROM driver_profiles WHERE id=? AND source='manual_admin'").bind(input.driverProfileId).first<Record<string,unknown>>();
    if(!profile)throw new Error("user_not_found");
    const row=await this.db.prepare(`INSERT INTO driver_documents(driver_profile_id,document_type,original_filename,mime_type,file_size,storage_provider,storage_file_id,storage_key,issue_date,expiry_date,verification_status,uploaded_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(input.driverProfileId,input.documentType,input.originalFilename,input.mimeType,input.fileSize,input.storageProvider,input.storageFileId,input.storageKey,input.issueDate,input.expiryDate,input.verificationStatus,actorUserId).first<{id:number}>();
    if(!row)throw new Error("document_insert_failed");
    if(input.documentType==='profile_photo')await this.db.prepare("UPDATE driver_profiles SET profile_photo_document_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(row.id,input.driverProfileId).run();
    await this.writeAudit(actorUserId,"driver.document_uploaded","driver_document",String(row.id),"success",{driverProfileId:input.driverProfileId,documentType:input.documentType,mimeType:input.mimeType,fileSize:input.fileSize});
    return Number(row.id);
  }

  async documentForDownload(documentId:number) { return this.db.prepare(`SELECT d.*,p.user_id FROM driver_documents d JOIN driver_profiles p ON p.id=d.driver_profile_id WHERE d.id=? AND d.archived_at IS NULL`).bind(documentId).first<Record<string,unknown>>(); }

  async archiveDriverDocument(documentId:number,actorUserId:number) {
    const document=await this.documentForDownload(documentId);if(!document)throw new Error("document_not_found");
    await this.db.batch([
      this.db.prepare("UPDATE driver_documents SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND archived_at IS NULL").bind(documentId),
      this.db.prepare("UPDATE driver_profiles SET profile_photo_document_id=NULL WHERE profile_photo_document_id=?").bind(documentId),
    ]);
    await this.writeAudit(actorUserId,"driver.document_archived","driver_document",String(documentId),"success",{driverProfileId:document.driver_profile_id,documentType:document.document_type});
  }

  async reviewDriverDocument(documentId:number,status:"verified"|"rejected",rejectionReason:string|null,actorUserId:number) {
    const document=await this.documentForDownload(documentId);if(!document)throw new Error("document_not_found");
    await this.db.prepare(`UPDATE driver_documents SET verification_status=?,verified_by=?,verified_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),rejection_reason=? WHERE id=? AND archived_at IS NULL`).bind(status,actorUserId,status==='rejected'?rejectionReason:null,documentId).run();
    await this.writeAudit(actorUserId,"driver.document_reviewed","driver_document",String(documentId),"success",{driverProfileId:document.driver_profile_id,status});
  }

  async driverRelations(userId:number) {
    const [assignments,handovers,audit]=await Promise.all([
      this.db.prepare(`SELECT a.*,v.internal_code,v.plate_number,CASE WHEN c.driver_user_id=? THEN 1 ELSE 0 END AS has_custody FROM vehicle_assignments a JOIN vehicles v ON v.id=a.vehicle_id LEFT JOIN vehicle_custodies c ON c.vehicle_id=v.id AND c.ended_at IS NULL WHERE a.driver_user_id=? ORDER BY a.assigned_at DESC`).bind(userId,userId).all<Record<string,unknown>>(),
      this.db.prepare(`SELECT h.*,v.internal_code,v.plate_number,f.display_name AS from_driver_name,t.display_name AS to_driver_name FROM vehicle_handovers h JOIN vehicles v ON v.id=h.vehicle_id LEFT JOIN users f ON f.id=h.from_driver_user_id JOIN users t ON t.id=h.to_driver_user_id WHERE h.from_driver_user_id=? OR h.to_driver_user_id=? ORDER BY h.handed_over_at DESC LIMIT 50`).bind(userId,userId).all<Record<string,unknown>>(),
      this.db.prepare(`SELECT id,action,result,created_at FROM audit_logs WHERE (entity_type='driver' AND entity_id=?) OR (entity_type='driver_document' AND entity_id IN (SELECT CAST(d.id AS TEXT) FROM driver_documents d JOIN driver_profiles p ON p.id=d.driver_profile_id WHERE p.user_id=?)) ORDER BY id DESC LIMIT 100`).bind(String(userId),userId).all<Record<string,unknown>>(),
    ]);
    return {assignments:assignments.results,handovers:handovers.results,audit:audit.results};
  }

  async driverDirectoryForSupervisor() {
    const rows=await this.db.prepare(`SELECT u.id,u.display_name AS full_name,u.login_code AS driver_code,u.phone,p.primary_shift,p.employment_status,p.branch_or_location,
      p.driving_license_status,p.driving_license_expiry,p.criminal_record_status,p.criminal_record_expiry,p.drug_test_status,p.drug_test_expiry,
      (SELECT COUNT(*) FROM driver_documents d WHERE d.driver_profile_id=p.id AND d.archived_at IS NULL) AS document_count
      FROM driver_profiles p JOIN users u ON u.id=p.user_id WHERE p.source='manual_admin' ORDER BY u.display_name`).all<Record<string,unknown>>();return rows.results;
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

  async listVehicles(search = "", status = "", location = "") {
    const term = `%${search.trim()}%`;
    const rows = await this.db.prepare(`SELECT v.*,
      (SELECT GROUP_CONCAT(u.display_name, '، ') FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id
       WHERE a.vehicle_id=v.id AND a.status='active' AND (a.valid_from IS NULL OR a.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) AND (a.valid_to IS NULL OR a.valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS authorized_driver_names,
      (SELECT u.display_name FROM vehicle_custodies c JOIN users u ON u.id=c.driver_user_id
       WHERE c.vehicle_id=v.id AND c.ended_at IS NULL LIMIT 1) AS current_driver_name,
      (SELECT c.driver_user_id FROM vehicle_custodies c WHERE c.vehicle_id=v.id AND c.ended_at IS NULL LIMIT 1) AS current_driver_user_id
      FROM vehicles v
      WHERE v.source='manual_admin' AND (?='' OR v.internal_code LIKE ? OR v.plate_number LIKE ? OR COALESCE(v.vin,'') LIKE ?)
      AND (?='' OR v.status=?) AND (?='' OR v.location LIKE ?) ORDER BY v.updated_at DESC`).bind(search.trim(), term, term, term, status, status, location.trim(), `%${location.trim()}%`).all<Record<string, unknown>>();
    return rows.results;
  }

  async createVehicle(input: VehicleInput, actorUserId: number) {
    const row = await this.db.prepare(`INSERT INTO vehicles (internal_code,plate_number,make,model,model_year,color,vin,engine_number,fuel_type,current_odometer,vehicle_license_number,vehicle_type,registration_expires_at,insurance_expires_at,insurance_company,location,status,notes,source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'manual_admin') RETURNING id`).bind(input.internalCode,input.plateNumber,input.make,input.model,input.modelYear,input.color,input.vin,input.engineNumber,input.fuelType,input.currentOdometer,input.vehicleLicenseNumber,input.vehicleType,input.registrationExpiresAt,input.insuranceExpiresAt,input.insuranceCompany,input.location,input.status,input.notes).first<{id:number}>();
    if (!row) throw new Error("Vehicle insert returned no row");
    await this.writeAudit(actorUserId,"vehicle.created","vehicle",String(row.id),"success",{status:input.status});
    return Number(row.id);
  }

  async updateVehicle(id: number, input: VehicleInput, actorUserId: number) {
    const existing = await this.db.prepare("SELECT id FROM vehicles WHERE id=? AND source='manual_admin'").bind(id).first();
    if (!existing) throw new Error("vehicle_not_found");
    await this.db.prepare(`UPDATE vehicles SET internal_code=?,plate_number=?,make=?,model=?,model_year=?,color=?,vin=?,engine_number=?,fuel_type=?,current_odometer=?,vehicle_license_number=?,vehicle_type=?,registration_expires_at=?,insurance_expires_at=?,insurance_company=?,location=?,status=?,notes=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND source='manual_admin'`)
      .bind(input.internalCode,input.plateNumber,input.make,input.model,input.modelYear,input.color,input.vin,input.engineNumber,input.fuelType,input.currentOdometer,input.vehicleLicenseNumber,input.vehicleType,input.registrationExpiresAt,input.insuranceExpiresAt,input.insuranceCompany,input.location,input.status,input.notes,id).run();
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
      WHERE a.source='manual_admin' AND v.source='manual_admin'
      ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END,a.valid_from DESC,a.id DESC`).all<Record<string,unknown>>();
    return rows.results;
  }

  async authorizeDrivers(vehicleId: number, authorizations: DriverAuthorizationInput[], actorUserId: number) {
    if (!authorizations.length) throw new Error("invalid_assignment");
    const vehicle = await this.db.prepare("SELECT id FROM vehicles WHERE id=? AND status='active' AND source='manual_admin'").bind(vehicleId).first();
    if (!vehicle) throw new Error("vehicle_not_assignable");
    const uniqueDrivers = new Set(authorizations.map((item) => item.driverUserId));
    if (uniqueDrivers.size !== authorizations.length) throw new Error("invalid_assignment");
    const statements: Statement[] = [];
    for (const authorization of authorizations) {
      const driver = await this.db.prepare(`SELECT u.id FROM users u JOIN driver_profiles p ON p.user_id=u.id
        WHERE u.id=? AND u.role='driver' AND u.status='active' AND p.employment_status='active' AND p.source='manual_admin'`).bind(authorization.driverUserId).first();
      if (!driver) throw new Error("invalid_driver");
      const existing = await this.db.prepare("SELECT id FROM vehicle_assignments WHERE vehicle_id=? AND driver_user_id=? AND status='active'")
        .bind(vehicleId, authorization.driverUserId).first<{id:number}>();
      if (existing) {
        statements.push(this.db.prepare(`UPDATE vehicle_assignments SET shift_type=?,valid_from=?,valid_to=?,assignment_type=?
          WHERE id=?`).bind(authorization.shiftType,authorization.validFrom,authorization.validTo,authorization.assignmentType,existing.id));
      } else {
        statements.push(this.db.prepare(`INSERT INTO vehicle_assignments
          (driver_user_id,vehicle_id,assigned_at,unassigned_at,shift_type,valid_from,valid_to,assignment_type,status,source,assigned_by_user_id)
          VALUES (?,?,?,NULL,?,?,?,?, 'active','manual_admin',?)`).bind(authorization.driverUserId,vehicleId,authorization.validFrom,authorization.shiftType,authorization.validFrom,authorization.validTo,authorization.assignmentType,actorUserId));
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
    const vehicle = await this.db.prepare("SELECT id,status FROM vehicles WHERE id=? AND source='manual_admin'").bind(input.vehicleId).first<Record<string,unknown>>();
    if (!vehicle) throw new Error("vehicle_not_found");
    if (vehicle.status !== "active") throw new Error("vehicle_not_handoverable");
    const recipient = await this.db.prepare(`SELECT a.id FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id
      WHERE a.vehicle_id=? AND a.driver_user_id=? AND a.status='active'
      AND (a.valid_from IS NULL OR a.valid_from<=?) AND (a.valid_to IS NULL OR a.valid_to>?)
      AND a.source='manual_admin' AND u.role='driver' AND u.status='active' LIMIT 1`)
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
        (vehicle_id,from_driver_user_id,to_driver_user_id,handed_over_at,received_at,odometer,fuel_level,fuel_note,vehicle_condition,fault_notes,general_notes,created_by,source)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'manual_admin')`).bind(input.vehicleId,fromDriverUserId,input.toDriverUserId,now,now,input.odometer,input.fuelLevel,input.fuelNote,input.vehicleCondition,input.faultNotes,input.generalNotes,actorUserId),
      this.db.prepare("INSERT INTO vehicle_custodies (vehicle_id,driver_user_id,started_at,opened_by_user_id,source) VALUES (?,?,?,?,'manual_admin')").bind(input.vehicleId,input.toDriverUserId,now,actorUserId),
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
      WHERE h.source='manual_admin' AND (? IS NULL OR h.vehicle_id=?) ORDER BY h.handed_over_at DESC,h.id DESC`)
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
      WHERE a.driver_user_id=? AND a.status='active' AND a.source='manual_admin' AND v.source='manual_admin'
      AND (a.valid_from IS NULL OR a.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      AND (a.valid_to IS NULL OR a.valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now')) ORDER BY a.assignment_type,a.valid_from`)
      .bind(userId,userId).all<Record<string,unknown>>();
    const handovers = await this.db.prepare(`SELECT h.id,h.vehicle_id,h.handed_over_at,h.received_at,
      v.internal_code,from_user.display_name AS from_driver_name,to_user.display_name AS to_driver_name,
      CASE WHEN h.to_driver_user_id=? THEN 'received' ELSE 'delivered' END AS direction
      FROM vehicle_handovers h JOIN vehicles v ON v.id=h.vehicle_id
      LEFT JOIN users from_user ON from_user.id=h.from_driver_user_id JOIN users to_user ON to_user.id=h.to_driver_user_id
      WHERE h.source='manual_admin' AND (h.from_driver_user_id=? OR h.to_driver_user_id=?) ORDER BY h.handed_over_at DESC LIMIT 10`)
      .bind(userId,userId,userId).all<Record<string,unknown>>();
    return {user,assignments:assignments.results,handovers:handovers.results};
  }

  async vehicleOperationsOverview() {
    const rows = await this.db.prepare(`SELECT v.id,v.internal_code,v.plate_number,v.status,
      (SELECT GROUP_CONCAT(u.display_name || ' (' || a.shift_type || ')', '، ')
       FROM vehicle_assignments a JOIN users u ON u.id=a.driver_user_id
       WHERE a.vehicle_id=v.id AND a.status='active' AND a.source='manual_admin'
       AND (a.valid_from IS NULL OR a.valid_from<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       AND (a.valid_to IS NULL OR a.valid_to>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS authorized_drivers,
      (SELECT u.display_name FROM vehicle_custodies c JOIN users u ON u.id=c.driver_user_id
       WHERE c.vehicle_id=v.id AND c.ended_at IS NULL LIMIT 1) AS current_driver_name,
      (SELECT COALESCE(f.display_name,'بداية التشغيل') || ' ← ' || t.display_name || ' — ' || h.received_at
       FROM vehicle_handovers h LEFT JOIN users f ON f.id=h.from_driver_user_id JOIN users t ON t.id=h.to_driver_user_id
       WHERE h.vehicle_id=v.id AND h.source='manual_admin' ORDER BY h.handed_over_at DESC,h.id DESC LIMIT 1) AS last_handover
      FROM vehicles v WHERE v.status!='retired' AND v.source='manual_admin' ORDER BY v.internal_code`).all<Record<string,unknown>>();
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
