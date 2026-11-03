import "server-only";
import type { createServiceSupabaseClient } from "@/lib/supabase/service";
import { parseEncryptionKey } from "@/lib/token-crypto";
import { openWhatsappToken, sealWhatsappToken, type StoredWhatsappToken } from "@/lib/whatsapp-token-rules";
import { logEvent } from "@/lib/logger";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

/** Postgres "undefined_column": the encryption migration isn't applied yet. */
const UNDEFINED_COLUMN = "42703";

function encryptionKey(): Buffer | null {
  return parseEncryptionKey(process.env.META_TOKEN_ENCRYPTION_KEY);
}

/** The columns to write for a new/updated token (encrypted when META_TOKEN_ENCRYPTION_KEY is set). */
export function whatsappTokenColumns(plaintext: string): StoredWhatsappToken {
  const key = encryptionKey();
  if (!key) logEvent("whatsapp_token_stored_unencrypted", "system", { reason: "no_encryption_key" }, "error");
  return sealWhatsappToken(plaintext, key);
}

/**
 * Reads and decrypts a business's WhatsApp token (production readiness,
 * item 9). A legacy plaintext row is re-encrypted on first read and its
 * plaintext cleared. Works before migration 20261120000000 is applied too
 * (falls back to the plaintext column), so the deploy order can't stop sends.
 * Never logs the token.
 */
export async function getWhatsappAccessToken(supabase: ServiceSupabaseClient, businessId: string): Promise<string | null> {
  const key = encryptionKey();
  let row: StoredWhatsappToken | null = null;

  const both = await supabase
    .from("whatsapp_credentials")
    .select("access_token, access_token_encrypted")
    .eq("business_id", businessId)
    .maybeSingle<StoredWhatsappToken>();

  if (both.error?.code === UNDEFINED_COLUMN) {
    const legacy = await supabase
      .from("whatsapp_credentials")
      .select("access_token")
      .eq("business_id", businessId)
      .maybeSingle<{ access_token: string }>();
    return legacy.data?.access_token ?? null;
  }
  row = both.data ?? null;

  const opened = openWhatsappToken(row, key);
  if (opened.token === null) {
    if (opened.reason !== "missing") logEvent("whatsapp_token_unreadable", businessId, { reason: opened.reason }, "error");
    return null;
  }

  if (opened.reencrypt) {
    const { error } = await supabase
      .from("whatsapp_credentials")
      .update({ ...opened.reencrypt, token_updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .is("access_token_encrypted", null);
    if (error) logEvent("whatsapp_token_reencrypt_failed", businessId, {}, "error");
    else logEvent("whatsapp_token_reencrypted", businessId, {});
  }
  return opened.token;
}
