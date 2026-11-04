-- fix_whatsapp_template_name_check
--
-- 20261124000000 created the check `template_name ~ '^[a-z0-9_]{1,512}$'`.
-- Postgres caps a regex repetition count at 255, so that pattern is invalid
-- ("invalid repetition count(s)"). Postgres only compiles it when a row is
-- checked, so the migration applied but EVERY insert into the table failed.
-- Same rule, written validly: Meta-shaped characters, 1-512 long.

alter table public.whatsapp_template_statuses
  drop constraint whatsapp_template_statuses_template_name_check;

alter table public.whatsapp_template_statuses
  add constraint whatsapp_template_statuses_template_name_check
  check (template_name ~ '^[a-z0-9_]+$' and char_length(template_name) <= 512);
