-- Allows an authenticated caller to create the businesses row for their
-- own Clerk organization. Mirrors the existing SELECT policy's org-match
-- shape; deliberately does not also gate on role here — "must be an org
-- admin" is enforced at the application layer via
-- auth.protect({ role: "org:admin" }), not a hand-parsed JWT role claim.

grant insert on public.businesses to authenticated;

create policy "businesses_insert_own_org" on public.businesses
  for insert
  to authenticated
  with check (
    clerk_org_id = ((select auth.jwt()) -> 'o' ->> 'id')
  );
