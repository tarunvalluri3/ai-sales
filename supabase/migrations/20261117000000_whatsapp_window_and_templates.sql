-- Production readiness, item 4 (LAUNCH_AUDIT.md §7, blocker B5): WhatsApp's
-- 24-hour customer-service window and message templates.
--
-- Meta only delivers free-form text within 24 hours of the customer's last
-- message; outside it only an APPROVED template is allowed (error 131047
-- otherwise). Before this, nothing checked the window and nothing could send a
-- template, so an appointment confirmed more than a day after the prospect's
-- last message was silently rejected and retried until dead-lettered.
--
-- Each outbound row can now carry the template to use if the window has
-- closed by the time it is sent (lib/whatsapp-delivery.ts decides at send
-- time, so a cron retry hours later still does the right thing):
--   template_kind      -- which notice this is (appointment_confirmed ...),
--                         set even when no template is configured, so the
--                         failure can say "template not configured"
--   template_name, template_language, template_params -- the approved
--                         template and its body parameters
--   sent_as            -- 'text' or 'template', once sent
--   failure_reason     -- machine code when a row fails for good
--                         (outside_24h_window, template_not_configured,
--                         template_rejected, recipient_unreachable ...)
-- and Meta's status callbacks (sent / delivered / read / failed) are
-- recorded: delivery_status, delivery_error_code, delivered_at, read_at.
--
-- No new table, no grant change: whatsapp_outbound_messages stays
-- service-role only (RLS forced, no authenticated grant).

alter table public.whatsapp_outbound_messages
  add column template_kind text,
  add column template_name text,
  add column template_language text,
  add column template_params jsonb,
  add column sent_as text check (sent_as in ('text', 'template')),
  add column failure_reason text,
  add column delivery_status text check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  add column delivery_error_code integer,
  add column delivered_at timestamptz,
  add column read_at timestamptz,
  add constraint whatsapp_outbound_template_complete check (
    template_name is null or (template_language is not null and template_params is not null)
  );

-- Status callbacks look the row up by Meta's message id.
create index whatsapp_outbound_messages_wa_message_id_idx
  on public.whatsapp_outbound_messages (wa_message_id)
  where wa_message_id is not null;
