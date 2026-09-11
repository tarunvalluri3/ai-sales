-- Fixes a real race condition found 2026-09-11: getOrCreateWhatsappConversation()
-- (lib/whatsapp.ts) was a plain select-then-insert with no lock -- two
-- near-simultaneous Meta webhook deliveries for the same WhatsApp sender
-- could each find no existing conversation and each create their own,
-- then each independently call the AI, producing near-duplicate replies.
--
-- Scoped to `where source = 'whatsapp'` only -- the website widget
-- legitimately creates multiple conversations sharing the same
-- client-generated visitor_id over time (a new session per visit), so a
-- blanket unique constraint across every source would break that. Same
-- partial-index convention this table already uses
-- (conversations_business_needs_attention_idx).
--
-- Verified live before this migration was written: zero existing
-- duplicate (business_id, visitor_id) pairs among source = 'whatsapp'
-- rows, so this constraint applies cleanly with no pre-existing conflict.
create unique index conversations_whatsapp_active_visitor_idx
  on public.conversations (business_id, visitor_id)
  where source = 'whatsapp';
