declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    AUTH_IP_HASH_KEY?: string;
    IDENTITY_STAGING_VALIDATION?: string;
  };
}
