import { requireReadyRequest } from "@/app/api/auth/_shared";
import { getD1 } from "@/db";
import { OperationalStore } from "@/db/operational-store";
import { IdentityError } from "@/lib/identity/core";

export async function operationalStore() { return new OperationalStore(await getD1()); }
export async function requireAdmin(request: Request) { return requireReadyRequest(request,["system_admin"]); }

export function operationalError(error: unknown) {
  if (error instanceof IdentityError) return Response.json({error:error.message,code:error.code},{status:error.status});
  const message=error instanceof Error?error.message:"";
  if (message.includes("last_system_admin")) return Response.json({error:"لا يمكن تعطيل أو خفض صلاحية آخر مدير نظام نشط.",code:"last_system_admin"},{status:409});
  if (message.includes("invalid_user")||message.includes("invalid_vehicle")||message.includes("invalid_assignment")||message.includes("invalid_settings")) return Response.json({error:"البيانات المدخلة غير صالحة.",code:"invalid_input"},{status:400});
  if (message.includes("UNIQUE constraint failed")) return Response.json({error:"كود الدخول أو البريد أو كود السيارة أو اللوحة مستخدم بالفعل.",code:"duplicate_value"},{status:409});
  if (message.includes("user_not_found")||message.includes("vehicle_not_found")) return Response.json({error:"السجل المطلوب غير موجود.",code:"not_found"},{status:404});
  if (message.includes("invalid_driver")) return Response.json({error:"يجب اختيار حساب سائق نشط.",code:"invalid_driver"},{status:400});
  if (message.includes("vehicle_not_assignable")) return Response.json({error:"السيارة غير نشطة أو غير قابلة للتخصيص.",code:"vehicle_not_assignable"},{status:409});
  return Response.json({error:"تعذر إتمام العملية.",code:"operational_error"},{status:500});
}

export function idFrom(value:string){const id=Number(value);if(!Number.isInteger(id)||id<1)throw new IdentityError(400,"invalid_id","المعرّف غير صالح.");return id;}
