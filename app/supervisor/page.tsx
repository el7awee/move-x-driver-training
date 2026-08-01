import { getD1 } from "@/db";
import { OperationalStore } from "@/db/operational-store";
import { OperationalShell, PageTitle } from "@/components/operational-shell";
import { requirePageRole } from "@/lib/operational/server-auth";

export default async function SupervisorPage(){
  const current=await requirePageRole(["supervisor"]);
  const store=new OperationalStore(await getD1());
  const[vehicles,drivers]=await Promise.all([store.vehicleOperationsOverview(),store.driverDirectoryForSupervisor()]);
  return <OperationalShell role={current.user.role} name={current.user.displayName}>
    <PageTitle title="لوحة المشرف" subtitle="تصاريح القيادة، والحيازة الفعلية، وآخر تسليم لكل سيارة — للعرض فقط."/>
    <section className="op-panel"><div className="op-table-wrap"><table><thead><tr><th>السيارة</th><th>اللوحة</th><th>السائقون المصرح لهم</th><th>الحيازة الحالية</th><th>آخر تسليم</th></tr></thead><tbody>{vehicles.map((vehicle,index)=><tr key={String(vehicle.id??index)}><td>{String(vehicle.internal_code)}</td><td>{String(vehicle.plate_number)}</td><td>{vehicle.authorized_drivers?String(vehicle.authorized_drivers):"لا يوجد"}</td><td>{vehicle.current_driver_name?String(vehicle.current_driver_name):"لا أحد"}</td><td>{vehicle.last_handover?String(vehicle.last_handover):"لا يوجد سجل"}</td></tr>)}</tbody></table></div></section>
    <section className="op-panel"><h2>دليل الكباتن وحالة المستندات</h2><p className="op-muted">لا تعرض هذه الشاشة الرقم القومي أو صور البطاقة أو الصحيفة أو تحليل المخدرات.</p><div className="op-table-wrap"><table><thead><tr><th>الكابتن</th><th>الهاتف</th><th>الوردية</th><th>الحالة</th><th>الرخصة</th><th>الصحيفة</th><th>تحليل المخدرات</th><th>عدد المستندات</th></tr></thead><tbody>{drivers.map((driver,index)=><tr key={String(driver.id??index)}><td>{String(driver.full_name)}<br/><small>{String(driver.driver_code)}</small></td><td>{String(driver.phone)}</td><td>{String(driver.primary_shift)}</td><td>{String(driver.employment_status)}</td><td>{String(driver.driving_license_status)} — {String(driver.driving_license_expiry??"—")}</td><td>{String(driver.criminal_record_status)} — {String(driver.criminal_record_expiry??"—")}</td><td>{String(driver.drug_test_status)} — {String(driver.drug_test_expiry??"—")}</td><td>{String(driver.document_count)}</td></tr>)}</tbody></table></div></section>
    <section className="op-panel"><h2>الدورات والمتابعة</h2><p>ستتاح هذه المساحة عند دمج نظام الدورات لاحقًا.</p></section>
  </OperationalShell>;
}
