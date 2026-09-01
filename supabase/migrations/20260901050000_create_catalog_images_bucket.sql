-- Phase B2 (STATE.md, "AI sales agent, not chatbot" -- PDF catalog
-- photos): a public bucket for product/service photos rendered from an
-- uploaded PDF catalog (lib/knowledge-extraction.ts's
-- extractCatalogFromPdfDocument, lib/pdf-page-images.ts). Deliberately
-- separate from the private `knowledge-files` bucket
-- (20260821050000) -- a rendered catalog photo is meant to be shown
-- publicly in the chat widget to any prospect, unlike an uploaded
-- knowledge document, which can contain arbitrary internal business
-- content the tenant-scoped RLS on that bucket protects.
--
-- No RLS policies: only the service role ever writes here (the
-- extraction pipeline runs off the request path via after(), no Clerk
-- session -- same service-role-only pattern as ai_response_cache/
-- rate_limit_counters), and a public bucket serves reads via Supabase
-- Storage's own public-object endpoint, which does not go through RLS
-- at all -- same mechanism any other public Supabase Storage bucket
-- (e.g. a public avatars bucket) relies on.
insert into storage.buckets (id, name, public)
values ('catalog-images', 'catalog-images', true);
