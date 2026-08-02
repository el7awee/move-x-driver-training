import { driverDocumentEnvironment, googleDriveDocumentsConfigured, GoogleDriveDocumentStorage, validateVehicleDocumentBytes } from "@/lib/operational/driver-documents";
import { idFrom, operationalError, operationalStore, requireAdmin } from "../../../_shared";

type Context={params:Promise<{vehicleId:string}>};

export async function GET(request:Request,{params}:Context){try{
  await requireAdmin(request);const vehicleId=idFrom((await params).vehicleId);const store=await operationalStore();
  const vehicle=(await store.listVehicles()).find(row=>Number(row.id)===vehicleId);if(!vehicle)throw new Error("vehicle_not_found");
  const env=await driverDocumentEnvironment();
  return Response.json({documents:await store.listVehicleDocuments(vehicleId),storageConfigured:googleDriveDocumentsConfigured(env)},{headers:{"Cache-Control":"no-store"}});
}catch(error){return operationalError(error)}}

export async function POST(request:Request,{params}:Context){try{
  const current=await requireAdmin(request);const vehicleId=idFrom((await params).vehicleId);const store=await operationalStore();
  const env=await driverDocumentEnvironment();if(!googleDriveDocumentsConfigured(env))throw new Error("document_storage_unavailable");
  const form=await request.formData();const file=form.get("file");if(!(file instanceof File))throw new Error("invalid_document_mime");
  const document=validateVehicleDocumentBytes(new Uint8Array(await file.arrayBuffer()),file.name,file.type,String(form.get("documentType")??""));
  const storage=new GoogleDriveDocumentStorage(env);const uploaded=await storage.upload(document,"vehicle-license");
  try{const documentId=await store.createVehicleDocument({vehicleId,documentType:document.documentType,originalFilename:document.originalFilename,mimeType:document.mimeType,fileSize:document.bytes.length,storageProvider:"google_drive",storageFileId:uploaded.fileId,storageKey:null,verificationStatus:"pending"},current.context.user.id);return Response.json({id:documentId},{status:201})}
  catch(error){await storage.remove(uploaded.fileId);throw error}
}catch(error){return operationalError(error)}}
