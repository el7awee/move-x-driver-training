import { DriverManager } from "@/components/operational-managers";
import { OperationalShell, PageTitle } from "@/components/operational-shell";
import { requirePageRole } from "@/lib/operational/server-auth";
export default async function DriversPage(){const current=await requirePageRole(["system_admin"]);return <OperationalShell role={current.user.role} name={current.user.displayName}><PageTitle title="إدارة السائقين" subtitle="إضافة وتحديث وتعطيل السائقين من Move X فقط، دون استيراد أو حذف نهائي."/><DriverManager/></OperationalShell>}
