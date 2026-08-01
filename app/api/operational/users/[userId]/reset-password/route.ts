import { hashPassword } from "@/lib/identity/core";
import { generateTemporaryPassword } from "@/lib/operational/core";
import { idFrom, operationalError, operationalStore, requireAdmin } from "../../../_shared";
type C={params:Promise<{userId:string}>};
export async function POST(request:Request,{params}:C){try{const current=await requireAdmin(request);const temporaryPassword=generateTemporaryPassword();await (await operationalStore()).resetPassword(idFrom((await params).userId),await hashPassword(temporaryPassword),current.context.user.id);return Response.json({temporaryPassword},{headers:{"Cache-Control":"no-store"}});}catch(e){return operationalError(e)}}
