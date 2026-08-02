import { EMPLOYMENT_STATUSES, type EmploymentStatus } from "@/lib/operational/core";
import { idFrom, operationalError, operationalStore, requireAdmin } from "../../../_shared";
type Context={params:Promise<{driverId:string}>};
export async function PATCH(request:Request,{params}:Context){try{const current=await requireAdmin(request);const body=await request.json() as {status?:string};if(!EMPLOYMENT_STATUSES.includes(body.status as EmploymentStatus))throw new Error("invalid_driver_profile");await(await operationalStore()).setDriverEmploymentStatus(idFrom((await params).driverId),body.status as EmploymentStatus,current.context.user.id);return Response.json({ok:true});}catch(error){return operationalError(error)}}
