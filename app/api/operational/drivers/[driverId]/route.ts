import { parseDriverInput, protectNationalId } from "@/lib/operational/core";
import { idFrom, operationalError, operationalStore, requireAdmin } from "../../_shared";
type Context={params:Promise<{driverId:string}>};
export async function PATCH(request:Request,{params}:Context){try{const current=await requireAdmin(request);const input=parseDriverInput(await request.json() as Record<string,unknown>);const protectedId=await protectNationalId(input.nationalId);await(await operationalStore()).updateDriver(idFrom((await params).driverId),{...input,nationalIdHash:protectedId?.hash??null,nationalIdLast4:protectedId?.last4??null},current.context.user.id);return Response.json({ok:true});}catch(error){return operationalError(error)}}
