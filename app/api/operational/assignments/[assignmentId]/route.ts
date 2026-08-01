import { idFrom, operationalError, operationalStore, requireAdmin } from "../../_shared";

export async function DELETE(request:Request,{params}:{params:Promise<{assignmentId:string}>}) {
  try {
    const current=await requireAdmin(request);
    const id=idFrom((await params).assignmentId);
    await(await operationalStore()).endAuthorization(id,current.context.user.id);
    return Response.json({ok:true});
  } catch(error) { return operationalError(error); }
}
