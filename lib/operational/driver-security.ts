const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function deriveKey(secret: string, purpose: "encryption" | "deduplication") {
  if (secret.length < 32) throw new Error("driver_data_protection_unavailable");
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  if (purpose === "encryption") {
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: encoder.encode("move-x-driver-profile-v1"), info: encoder.encode("national-id-encryption") },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("move-x-driver-profile-v1"), info: encoder.encode("national-id-deduplication") },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

export async function protectNationalId(value: string | null, secret: string) {
  if (!value) return null;
  const normalized = value.replaceAll(/\s/g, "");
  if (!/^[0-9]{8,20}$/.test(normalized)) throw new Error("invalid_driver_profile");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await deriveKey(secret, "encryption"), encoder.encode(normalized));
  const hash = await crypto.subtle.sign("HMAC", await deriveKey(secret, "deduplication"), encoder.encode(normalized));
  return {
    encrypted: `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`,
    hash: `v1.${base64Url(new Uint8Array(hash))}`,
    last4: normalized.slice(-4),
  };
}

export async function nationalIdHash(value: string, secret: string) {
  return (await protectNationalId(value, secret))?.hash ?? null;
}

export async function revealNationalId(payload: string, secret: string) {
  const [version, ivValue, encryptedValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) throw new Error("invalid_encrypted_national_id");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(ivValue) },
    await deriveKey(secret, "encryption"),
    fromBase64Url(encryptedValue),
  );
  return decoder.decode(decrypted);
}

export function maskNationalId(last4: string | null) {
  return last4 ? `**********${last4}` : null;
}

export async function driverDataProtectionKey() {
  const { env } = await import("cloudflare:workers");
  const value = env.DRIVER_DATA_PROTECTION_KEY ?? process.env.DRIVER_DATA_PROTECTION_KEY;
  if (!value || value.length < 32) throw new Error("driver_data_protection_unavailable");
  return value;
}
