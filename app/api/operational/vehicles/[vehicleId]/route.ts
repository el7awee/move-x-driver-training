import { idFrom, operationalError, operationalStore, requireAdmin } from "../../_shared";
import { parseVehicleInput } from "@/lib/operational/core";
type C={params:Promise<{vehicleId:string}>};
export async function PATCH(request:Request,{params}:C){try{const current=await requireAdmin(request);await(await operationalStore()).updateVehicle(idFrom((await params).vehicleId),parseVehicleInput(await request.json()),current.context.user.id);return Response.json({ok:true});}catch(e){return operationalError(e)}}
