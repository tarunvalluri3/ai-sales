-- Stage 2 of "generalize the AI's business understanding" (STATE.md): lets
-- catalog data extracted from a knowledge document sit in a reviewable
-- draft state before it can ever be answered by the AI -- AGENTS.md rule 4
-- (no fabricated business facts) applied to auto-extracted rows the same
-- way knowledge_documents.status already gates manually authored ones.
--
-- `status` defaults to 'approved' so every existing row, and every future
-- manually-created row via the dashboard forms, is unaffected -- only
-- lib/knowledge-extraction.ts ever inserts 'draft'. Existing table-level
-- grants (`grant select, insert, update, delete ... to authenticated`) and
-- RLS policies are unchanged -- both already scope by business_id, not by
-- any per-column rule, so neither new column needs a grant or policy
-- change of its own.

alter table public.products
  add column status text not null default 'approved' check (status in ('draft', 'approved')),
  add column extracted_from_document_id uuid references public.knowledge_documents (id) on delete set null;

alter table public.services
  add column status text not null default 'approved' check (status in ('draft', 'approved')),
  add column extracted_from_document_id uuid references public.knowledge_documents (id) on delete set null;

alter table public.faqs
  add column status text not null default 'approved' check (status in ('draft', 'approved')),
  add column extracted_from_document_id uuid references public.knowledge_documents (id) on delete set null;
