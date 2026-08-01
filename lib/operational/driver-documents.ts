import { DRIVER_DOCUMENT_TYPES, type DriverDocumentType } from "./core.ts";

export const MAX_DRIVER_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export interface ValidatedDriverDocument {
  bytes: Uint8Array;
  mimeType: keyof typeof MIME_EXTENSIONS;
  extension: string;
  originalFilename: string;
  documentType: DriverDocumentType;
}

export function detectDocumentMime(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>bytes[index]===byte)) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-") return "application/pdf";
  return null;
}

export function validateDocumentBytes(bytes: Uint8Array, originalFilename: string, claimedMimeType: string, documentType: string): ValidatedDriverDocument {
  if (!DRIVER_DOCUMENT_TYPES.includes(documentType as DriverDocumentType)) throw new Error("invalid_document_type");
  if (!bytes.length || bytes.length > MAX_DRIVER_DOCUMENT_BYTES) throw new Error("invalid_document_size");
  const detected = detectDocumentMime(bytes);
  if (!detected || !(detected in MIME_EXTENSIONS) || detected !== claimedMimeType.toLowerCase()) throw new Error("invalid_document_mime");
  const cleanName = originalFilename.replaceAll(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim().slice(0, 180) || `document.${MIME_EXTENSIONS[detected]}`;
  return { bytes, mimeType: detected, extension: MIME_EXTENSIONS[detected], originalFilename: cleanName, documentType: documentType as DriverDocumentType };
}

export function canDownloadDriverDocument(role: string, requesterUserId: number, ownerUserId: number) {
  void requesterUserId; void ownerUserId;
  return role === "system_admin";
}

export function canViewSensitiveDocumentMetadata(role: string, requesterUserId: number, ownerUserId: number) {
  return role === "system_admin" || (role === "driver" && requesterUserId === ownerUserId);
}

export function randomStorageName(extension: string) {
  return `${crypto.randomUUID()}.${extension}`;
}

export interface GoogleDriveDocumentEnv {
  DRIVER_DOCUMENTS_GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  DRIVER_DOCUMENTS_GOOGLE_PRIVATE_KEY?: string;
  DRIVER_DOCUMENTS_GOOGLE_DRIVE_FOLDER_ID?: string;
}

export function googleDriveDocumentsConfigured(env: GoogleDriveDocumentEnv): env is Required<GoogleDriveDocumentEnv> {
  return Boolean(env.DRIVER_DOCUMENTS_GOOGLE_SERVICE_ACCOUNT_EMAIL && env.DRIVER_DOCUMENTS_GOOGLE_PRIVATE_KEY && env.DRIVER_DOCUMENTS_GOOGLE_DRIVE_FOLDER_ID);
}

function pemToBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), character => character.charCodeAt(0));
}

function base64Json(value: unknown) {
  let binary="";for(const byte of new TextEncoder().encode(JSON.stringify(value)))binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function googleAccessToken(env: Required<GoogleDriveDocumentEnv>) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Json({alg:"RS256",typ:"JWT"})}.${base64Json({iss:env.DRIVER_DOCUMENTS_GOOGLE_SERVICE_ACCOUNT_EMAIL,scope:"https://www.googleapis.com/auth/drive.file",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(env.DRIVER_DOCUMENTS_GOOGLE_PRIVATE_KEY), {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"}, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  let binary="";for(const byte of signature)binary+=String.fromCharCode(byte);
  const assertion=`${unsigned}.${btoa(binary).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}`;
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  if(!response.ok)throw new Error("document_storage_auth_failed");
  const body=await response.json() as {access_token?:string};if(!body.access_token)throw new Error("document_storage_auth_failed");return body.access_token;
}

export class GoogleDriveDocumentStorage {
  private readonly env: Required<GoogleDriveDocumentEnv>;
  constructor(env: Required<GoogleDriveDocumentEnv>) { this.env = env; }

  async upload(document: ValidatedDriverDocument) {
    const token=await googleAccessToken(this.env);const boundary=`movex_${crypto.randomUUID()}`;const storedName=randomStorageName(document.extension);
    const metadata=JSON.stringify({name:storedName,parents:[this.env.DRIVER_DOCUMENTS_GOOGLE_DRIVE_FOLDER_ID],appProperties:{system:"move-x",category:"driver-document"}});
    const head=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${document.mimeType}\r\n\r\n`;
    const tail=`\r\n--${boundary}--`;const first=new TextEncoder().encode(head);const last=new TextEncoder().encode(tail);const body=new Uint8Array(first.length+document.bytes.length+last.length);body.set(first);body.set(document.bytes,first.length);body.set(last,first.length+document.bytes.length);
    const response=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":`multipart/related; boundary=${boundary}`},body});
    if(!response.ok)throw new Error("document_storage_upload_failed");const result=await response.json() as {id?:string};if(!result.id)throw new Error("document_storage_upload_failed");return {fileId:result.id,storageName:storedName};
  }

  async download(fileId:string) { const token=await googleAccessToken(this.env);const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error("document_storage_download_failed");return response; }
  async remove(fileId:string) { const token=await googleAccessToken(this.env);const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`}});if(!response.ok&&response.status!==404)throw new Error("document_storage_cleanup_failed"); }
}

export async function driverDocumentEnvironment() {
  const {env}=await import("cloudflare:workers");
  return {
    DRIVER_DOCUMENTS_GOOGLE_SERVICE_ACCOUNT_EMAIL:env.DRIVER_DOCUMENTS_GOOGLE_SERVICE_ACCOUNT_EMAIL,
    DRIVER_DOCUMENTS_GOOGLE_PRIVATE_KEY:env.DRIVER_DOCUMENTS_GOOGLE_PRIVATE_KEY,
    DRIVER_DOCUMENTS_GOOGLE_DRIVE_FOLDER_ID:env.DRIVER_DOCUMENTS_GOOGLE_DRIVE_FOLDER_ID,
  };
}
