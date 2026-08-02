declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    AUTH_IP_HASH_KEY?: string;
    IDENTITY_STAGING_VALIDATION?: string;
    DRIVER_DATA_PROTECTION_KEY?: string;
    DRIVER_DOCUMENTS_GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    DRIVER_DOCUMENTS_GOOGLE_PRIVATE_KEY?: string;
    DRIVER_DOCUMENTS_GOOGLE_DRIVE_FOLDER_ID?: string;
  };
}
