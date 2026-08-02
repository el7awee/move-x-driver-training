import { parseHandoverInput } from "@/lib/operational/core";
import { operationalError, operationalStore, requireAdmin } from "../_shared";

export async function GET(request:Request) {
  try {
    await requireAdmin(request);
    const raw=new URL(request.url).searchParams.get("vehicleId");
    const vehicleId=raw===null?undefined:Number(raw);
    if(vehicleId!==undefined&&(!Number.isInteger(vehicleId)||vehicleId<1))throw new Error("invalid_handover");
    return Response.json({handovers:await(await operationalStore()).listHandovers(vehicleId)});
  } catch(error) { return operationalError(error); }
}

export async function POST(request:Request) {
  try {
    const current=await requireAdmin(request);
    const input=parseHandoverInput(await request.json() as Record<string,unknown>);
    await(await operationalStore()).handoverVehicle(input,current.context.user.id);
    return Response.json({ok:true},{status:201});
  } catch(error) { return operationalError(error); }
}
