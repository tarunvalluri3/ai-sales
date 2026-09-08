-- WhatsApp dashboard polish pass (STATE.md): lets a business owner confirm
-- which access token is currently active without ever reading the token
-- back. Only the last 4 characters are stored, on the business-visible
-- `whatsapp_connections` row -- not `whatsapp_credentials`, which stays at
-- zero `authenticated` grant. A 4-character fragment of a Meta permanent
-- token carries no meaningful risk of reconstructing the secret, same
-- reasoning that already lets last-4-digit card/token fingerprints be
-- shown elsewhere without being treated as the secret itself.
alter table public.whatsapp_connections
  add column access_token_last4 text;
