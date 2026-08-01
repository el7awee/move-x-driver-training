import Link from "next/link";
import { getD1 } from "@/db";
import { OperationalStore } from "@/db/operational-store";
import { OperationalShell, PageTitle } from "@/components/operational-shell";
import { SettingsManager } from "@/components/operational-managers";
import { requirePageRole } from "@/lib/operational/server-auth";
const cards=[["المستخدمون","/admin/settings/users"],["السائقون","/admin/settings/drivers"],["المشرفون","/admin/settings/users?role=supervisor"],["السيارات","/admin/settings/vehicles"],["تخصيص السيارات","/admin/settings/assignments"],["الدورات","#courses"],["سجل العمليات","/admin/settings/audit"],["إعدادات عامة","#general"]];
export default async function SettingsPage(){const c=await requirePageRole(["system_admin"]);const settings=await new OperationalStore(await getD1()).settings();return <OperationalShell role={c.user.role} name={c.user.displayName}><PageTitle title="الإدارة والإعدادات" subtitle="إدارة التشغيل الأساسية من مكان واحد."/><div className="op-settings-grid">{cards.map(([label,href])=><Link key={label} href={href} aria-disabled={href==="#courses"}>{label}{href==="#courses"&&<small>يتاح بعد دمج نظام الدورات</small>}</Link>)}</div><div id="general"><SettingsManager initial={settings}/></div></OperationalShell>}
