import { driverDocumentEnvironment, googleDriveDocumentsConfigured, GoogleDriveDocumentStorage } from "@/lib/operational/driver-documents";
import { idFrom, operationalError, operationalStore, requireAdmin } from "../../_shared";

type Context={params:Promise<{documentId:string}>};

export async function GET(request:Request,{params}:Context){try{
  const current=await requireAdmin(request);const documentId=idFrom((await params).documentId);const store=await operationalStore();const document=await store.vehicleDocumentForDownload(documentId);if(!document)throw new Error("document_not_found");
  const env=await driverDocumentEnvironment();if(!googleDriveDocumentsConfigured(env))throw new Error("document_storage_unavailable");
  const upstream=await new GoogleDriveDocumentStorage(env).download(String(document.storage_file_id));await store.writeAudit(current.context.user.id,"vehicle.license_document_downloaded","vehicle_document",String(documentId));
  return new Response(upstream.body,{headers:{"Content-Type":String(document.mime_type),"Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(String(document.original_filename))}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}catch(error){return operationalError(error)}}

export async function DELETE(request:Request,{params}:Context){try{const current=await requireAdmin(request);await(await operationalStore()).archiveVehicleDocument(idFrom((await params).documentId),current.context.user.id);return Response.json({ok:true})}catch(error){return operationalError(error)}}

export async function PATCH(request:Request,{params}:Context){try{const current=await requireAdmin(request);const body=await request.json() as {status?:string;rejectionReason?:string};if(!['verified','rejected'].includes(body.status??'')||(body.status==='rejected'&&!body.rejectionReason?.trim()))throw new Error("invalid_document_type");await(await operationalStore()).reviewVehicleDocument(idFrom((await params).documentId),body.status as 'verified'|'rejected',body.rejectionReason?.trim().slice(0,500)??null,current.context.user.id);return Response.json({ok:true})}catch(error){return operationalError(error)}}
