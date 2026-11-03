/**
 * Pure rules for WhatsApp tokens at rest (production readiness, item 9).
 * Same AES-256-GCM format and key (META_TOKEN_ENCRYPTION_KEY) as Instagram's
 * tokens (lib/token-crypto.ts). No server-only import: unit-tested directly.
 */
import { decryptToken, encryptToken } from "@/lib/token-crypto";

export type StoredWhatsappToken = { access_token: string | null; access_token_encrypted: string | null };

/** What to write for a new/updated token: encrypted when a key is configured, else (legacy) plaintext. */
export function sealWhatsappToken(plaintext: string, key: Buffer | null): StoredWhatsappToken {
  return key
    ? { access_token: null, access_token_encrypted: encryptToken(plaintext, key) }
    : { access_token: plaintext, access_token_encrypted: null };
}

export type OpenedWhatsappToken =
  | { token: string; reencrypt: StoredWhatsappToken | null }
  | { token: null; reason: "missing" | "undecryptable" | "no_key" };

/**
 * Reads a stored row. A legacy plaintext row is returned as-is plus the
 * encrypted replacement to write back (lazy migration) when a key exists.
 */
export function openWhatsappToken(row: StoredWhatsappToken | null, key: Buffer | null): OpenedWhatsappToken {
  if (!row) return { token: null, reason: "missing" };
  if (row.access_token_encrypted) {
    if (!key) return { token: null, reason: "no_key" };
    try {
      return { token: decryptToken(row.access_token_encrypted, key), reencrypt: null };
    } catch {
      return { token: null, reason: "undecryptable" };
    }
  }
  if (row.access_token) {
    return { token: row.access_token, reencrypt: key ? sealWhatsappToken(row.access_token, key) : null };
  }
  return { token: null, reason: "missing" };
}
