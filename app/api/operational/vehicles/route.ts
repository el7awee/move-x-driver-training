import { parseVehicleInput } from "@/lib/operational/core";
import { operationalError, operationalStore, requireAdmin } from "../_shared";

export async function GET(request:Request){try{await requireAdmin(request);const url=new URL(request.url);return Response.json({vehicles:await(await operationalStore()).listVehicles(url.searchParams.get("q")??"",url.searchParams.get("status")??"",url.searchParams.get("location")??"")});}catch(e){return operationalError(e)}}
export async function POST(request:Request){try{const current=await requireAdmin(request);const store=await operationalStore();const id=await store.createVehicle(parseVehicleInput(await request.json()),current.context.user.id);return Response.json({id},{status:201});}catch(e){return operationalError(e)}}
