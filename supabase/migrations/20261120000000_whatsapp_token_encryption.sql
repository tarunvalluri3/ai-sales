-- Production readiness, item 9 (LAUNCH_AUDIT.md §7/§11/§C): WhatsApp access
-- tokens were stored in plaintext, unlike Instagram's AES-256-GCM encrypted
-- tokens. New/updated tokens are now written to access_token_encrypted (same
-- lib/token-crypto.ts format and META_TOKEN_ENCRYPTION_KEY as Instagram) and
-- access_token is left NULL. Existing plaintext rows are re-encrypted lazily
-- by the app the first time each token is used (lib/whatsapp-token.ts), so no
-- script ever has to read production tokens.
--
-- Table stays zero-grant / RLS forced (unchanged).

alter table public.whatsapp_credentials
  add column access_token_encrypted text,
  alter column access_token drop not null,
  add constraint whatsapp_credentials_token_present
    check (access_token is not null or access_token_encrypted is not null);
