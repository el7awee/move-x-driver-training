import { operationalError, operationalStore, requireAdmin } from "../_shared";
export async function GET(request:Request){try{await requireAdmin(request);return Response.json({audit:await(await operationalStore()).audit()});}catch(e){return operationalError(e)}}
