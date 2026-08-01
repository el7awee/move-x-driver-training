declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    TRAINING_VIDEOS?: R2Bucket;
    AUTH_IP_HASH_KEY?: string;
    IDENTITY_STAGING_VALIDATION?: string;
  };
}
