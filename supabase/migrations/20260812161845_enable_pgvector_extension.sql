-- Enables pgvector (Phase 7). Installed into the extensions schema, per
-- Supabase convention -- already on the search path
-- (supabase/config.toml's extra_search_path).

create extension if not exists vector with schema extensions;
