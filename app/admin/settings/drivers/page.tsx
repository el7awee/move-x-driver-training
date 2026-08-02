import { DriverProfilesManager } from "@/components/driver-profile-manager";
import { OperationalShell, PageTitle } from "@/components/operational-shell";
import { requirePageRole } from "@/lib/operational/server-auth";
export default async function DriversPage(){const current=await requirePageRole(["system_admin"]);return <OperationalShell role={current.user.role} name={current.user.displayName}><PageTitle title="إدارة الكباتن" subtitle="حساب الدخول وملف الكابتن ومستنداته مفصولة بوضوح ومربوطة بأمان."/><DriverProfilesManager/></OperationalShell>}
