import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for third-party access tokens kept at rest
 * (today: the Instagram Business Integration System User token).
 *
 * Pure: the key is an argument, so scripts/run-meta-instagram-tests.mjs can
 * import this directly. Callers read it from META_TOKEN_ENCRYPTION_KEY
 * (32 random bytes, base64 or 64 hex characters). Stored format:
 * `v1.<iv>.<tag>.<ciphertext>`, each base64url. A tampered blob or the
 * wrong key throws; nothing here logs the token or the key.
 */

const VERSION = "v1";

export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  return key.length === 32 ? key : null;
}

export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(blob: string, key: Buffer): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognised encrypted token format");
  }
  const [, iv, tag, ciphertext] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
