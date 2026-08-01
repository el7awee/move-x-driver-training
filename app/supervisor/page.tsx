import { getD1 } from "@/db";
import { OperationalStore } from "@/db/operational-store";
import { OperationalShell, PageTitle } from "@/components/operational-shell";
import { requirePageRole } from "@/lib/operational/server-auth";

export default async function SupervisorPage(){
  const current=await requirePageRole(["supervisor"]);
  const vehicles=await new OperationalStore(await getD1()).vehicleOperationsOverview();
  return <OperationalShell role={current.user.role} name={current.user.displayName}>
    <PageTitle title="لوحة المشرف" subtitle="تصاريح القيادة، والحيازة الفعلية، وآخر تسليم لكل سيارة — للعرض فقط."/>
    <section className="op-panel"><div className="op-table-wrap"><table><thead><tr><th>السيارة</th><th>اللوحة</th><th>السائقون المصرح لهم</th><th>الحيازة الحالية</th><th>آخر تسليم</th></tr></thead><tbody>{vehicles.map((vehicle,index)=><tr key={String(vehicle.id??index)}><td>{String(vehicle.internal_code)}</td><td>{String(vehicle.plate_number)}</td><td>{vehicle.authorized_drivers?String(vehicle.authorized_drivers):"لا يوجد"}</td><td>{vehicle.current_driver_name?String(vehicle.current_driver_name):"لا أحد"}</td><td>{vehicle.last_handover?String(vehicle.last_handover):"لا يوجد سجل"}</td></tr>)}</tbody></table></div></section>
    <section className="op-panel"><h2>الدورات والمتابعة</h2><p>ستتاح هذه المساحة عند دمج نظام الدورات لاحقًا.</p></section>
  </OperationalShell>;
}
