begin;
alter table public.businesses drop constraint if exists businesses_widget_language_check;
alter table public.businesses add constraint businesses_widget_language_check
  check (widget_language in ('en', 'es', 'fr', 'de', 'pt', 'hi', 'te', 'ta', 'kn', 'mr', 'bn', 'auto'));
commit;
