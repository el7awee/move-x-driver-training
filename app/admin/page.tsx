import { getD1 } from "@/db";
import { OperationalStore } from "@/db/operational-store";
import { requirePageRole } from "@/lib/operational/server-auth";
import { Cards, OperationalShell, PageTitle } from "@/components/operational-shell";

export default async function AdminPage(){const c=await requirePageRole(["system_admin"]);const s=await new OperationalStore(await getD1()).summary();return <OperationalShell role={c.user.role} name={c.user.displayName}><PageTitle title="لوحة مدير النظام" subtitle="ملخص حي من قاعدة بيانات التشغيل."/><Cards items={[{label:"المستخدمون",value:s?.users??0,href:"/admin/settings/users"},{label:"الكباتن النشطون",value:s?.drivers??0,href:"/admin/settings/drivers"},{label:"المشرفون النشطون",value:s?.supervisors??0,href:"/admin/settings/users?role=supervisor"},{label:"السيارات",value:s?.vehicles??0,href:"/admin/settings/vehicles"},{label:"التخصيصات النشطة",value:s?.assignments??0,href:"/admin/settings/assignments"}]}/></OperationalShell>}
