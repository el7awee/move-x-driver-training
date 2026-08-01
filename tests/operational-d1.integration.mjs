import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { OperationalStore } from "../db/operational-store.ts";

class Statement { constructor(db,sql){this.db=db;this.sql=sql;this.values=[]} bind(...v){this.values=v;return this} async all(){return{results:this.db.prepare(this.sql).all(...this.values)}} async first(){return this.db.prepare(this.sql).get(...this.values)??null} async run(){const r=this.db.prepare(this.sql).run(...this.values);return{meta:{changes:Number(r.changes)}}} }
class D1 { constructor(db){this.db=db} prepare(sql){return new Statement(this.db,sql)} async batch(statements){this.db.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await s.run());this.db.exec("COMMIT");return out}catch(e){this.db.exec("ROLLBACK");throw e}} }
const user=(loginCode,displayName,role="driver",status="active")=>({loginCode,displayName,email:null,phone:null,role,status,passwordHash:"test-hash"});
const vehicle=(code,plate,status="active")=>({internalCode:code,plateNumber:plate,make:"Test Make",model:"Test Model",modelYear:2024,color:null,status,notes:""});

test("operational D1 lifecycle enforces admin, vehicle, assignment and audit rules",async()=>{const db=new DatabaseSync(":memory:");try{db.exec("PRAGMA foreign_keys=ON");db.exec(await readFile(new URL("../drizzle/0000_identity_foundation.sql",import.meta.url),"utf8"));db.exec(await readFile(new URL("../drizzle/0002_operational_admin_core.sql",import.meta.url),"utf8"));const store=new OperationalStore(new D1(db));
  // Initial system administration is created by the existing identity bootstrap, not the CRUD API.
  db.prepare("INSERT INTO users(login_code,display_name,role,password_hash,must_change_password,status,preferred_language) VALUES(?,?,?,?,0,'active','ar')").run("ADMIN001","Primary Admin","system_admin","test-hash");
  const actor=Number(db.prepare("SELECT id FROM users WHERE login_code='ADMIN001'").get().id);
  await assert.rejects(()=>store.updateUser(actor,user("ADMIN001","Primary Admin","driver","active"),actor),/last_system_admin/);
  const driverId=await store.createUser(user("DRIVER001","Test Driver"),actor);const secondAdmin=await store.createUser(user("ADMIN002","Second Admin","system_admin"),actor);assert.ok(secondAdmin>driverId);
  db.prepare("INSERT INTO auth_sessions(user_id,token_hash,ip_hash,expires_at) VALUES(?,?,?,?)").run(driverId,"token-a","ip",new Date(Date.now()+60000).toISOString());await store.resetPassword(driverId,"new-test-hash",actor);assert.ok(db.prepare("SELECT revoked_at FROM auth_sessions WHERE user_id=?").get(driverId).revoked_at);
  const vehicleId=await store.createVehicle(vehicle("MX-001","ABC-123"),actor);await assert.rejects(()=>store.createVehicle(vehicle("MX-001","XYZ-999"),actor),/UNIQUE/);await assert.rejects(()=>store.createVehicle(vehicle("MX-002","ABC-123"),actor),/UNIQUE/);
  const maintenanceId=await store.createVehicle(vehicle("MX-003","MNT-003","maintenance"),actor);await assert.rejects(()=>store.assignVehicle(driverId,maintenanceId,actor),/vehicle_not_assignable/);await store.assignVehicle(driverId,vehicleId,actor);assert.equal((await store.driverOverview(driverId)).internal_code,"MX-001");
  const replacement=await store.createVehicle(vehicle("MX-004","NEW-004"),actor);await store.assignVehicle(driverId,replacement,actor);assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM vehicle_assignments WHERE driver_user_id=? AND status='active'").get(driverId).n),1);assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM vehicle_assignments WHERE driver_user_id=?").get(driverId).n),2);
  await store.updateVehicle(replacement,vehicle("MX-004","NEW-004","retired"),actor);assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM vehicle_assignments WHERE vehicle_id=? AND status='active'").get(replacement).n),0);
  await store.updateUser(driverId,user("DRIVER001","Test Driver","driver","suspended"),actor);assert.equal((await store.listUsers("DRIVER001","driver","inactive"))[0].status,"inactive");assert.ok((await store.audit()).length>=8);assert.deepEqual(await store.settings(),{company_name:"Move X",default_language:"ar",show_trips_button:"false",timezone:"Africa/Cairo",trips_form_url:""});
}finally{db.close()}});
