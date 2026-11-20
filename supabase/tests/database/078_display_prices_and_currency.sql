-- Migration 20261124000500: business currency + catalog price as display text.
--
--   1. A business with priced products that was published BEFORE the migration
--      shows 0 unpublished changes after it: its live snapshot (legacy form:
--      numeric price, null priceAmount) is rewritten by the same
--      normalize_snapshot_prices() the migration ran, and then equals the
--      draft built from the migrated tables.
--   2. Only price type (and the backfilled priceAmount) changed in the snapshot.
--   3. Display text such as "From ₹1,200" is storable; over 60 chars is not.
--   4. match_products / match_services return price as text.
--   5. businesses.currency defaults to INR and rejects a non-ISO value.
--
-- Run against the linked project via `npm test` (CI: the staging database).

begin;
select plan(10);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-0000000078a1', 'org_prices_a', 'Prices A');

-- Post-migration table state for an item that had price 6500.00 and no budget
-- amount: price '6500', price_amount backfilled to 6500.00.
insert into public.products (id, business_id, name, price, price_amount, status)
values ('00000000-0000-0000-0000-0000000078b1', '00000000-0000-0000-0000-0000000078a1', 'Teeth Whitening', '6500', 6500.00, 'approved');
insert into public.services (id, business_id, name, price, price_amount, status)
values ('00000000-0000-0000-0000-0000000078c1', '00000000-0000-0000-0000-0000000078a1', 'Consultation', 'From ₹500', 500, 'approved');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'user_prices_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_prices_a'))::text,
  true
);
select * from public.publish_agent('00000000-0000-0000-0000-0000000078a1');
reset role;

-- Turn the live version back into what a pre-migration publish stored: the
-- product's price as a JSON number and priceAmount null.
update public.agent_versions v
   set snapshot = jsonb_set(v.snapshot, '{products,0}', (v.snapshot -> 'products' -> 0) || '{"price": 6500.00, "priceAmount": null}'::jsonb)
  from public.businesses b
 where b.id = '00000000-0000-0000-0000-0000000078a1' and v.id = b.live_version_id;
update public.agent_versions v
   set content_hash = md5(v.snapshot::text)
  from public.businesses b
 where b.id = '00000000-0000-0000-0000-0000000078a1' and v.id = b.live_version_id;

insert into _tap_results select ok(
  (select live_snapshot is not null from public.agent_publish_status('00000000-0000-0000-0000-0000000078a1')),
  'sanity: the legacy-form live snapshot differs from the migrated draft before normalising'
);

-- The migration's own conversion.
update public.agent_versions v
   set snapshot = public.normalize_snapshot_prices(v.snapshot),
       content_hash = md5(public.normalize_snapshot_prices(v.snapshot)::text)
  from public.businesses b
 where b.id = '00000000-0000-0000-0000-0000000078a1' and v.id = b.live_version_id;

insert into _tap_results select ok(
  (select live_snapshot is null and draft_snapshot is null from public.agent_publish_status('00000000-0000-0000-0000-0000000078a1')),
  'after normalising, a business with priced products shows 0 unpublished changes'
);

insert into _tap_results select is(
  (select jsonb_typeof(v.snapshot -> 'products' -> 0 -> 'price')
     from public.businesses b join public.agent_versions v on v.id = b.live_version_id
    where b.id = '00000000-0000-0000-0000-0000000078a1'),
  'string',
  'the live snapshot price is text'
);

insert into _tap_results select is(
  public.normalize_snapshot_prices('{"schema":1,"config":{"name":"x"},"products":[{"name":"a","price":19.90,"priceAmount":15}],"services":[],"faqs":[],"knowledge":[]}'::jsonb),
  '{"schema":1,"config":{"name":"x"},"products":[{"name":"a","price":"19.9","priceAmount":15}],"services":[],"faqs":[],"knowledge":[]}'::jsonb,
  'normalising changes only the price type; an existing priceAmount and every other key are untouched'
);

insert into _tap_results select is(
  (select price from public.services where id = '00000000-0000-0000-0000-0000000078c1'),
  'From ₹500',
  'display text like "From ₹500" is stored as typed'
);

insert into _tap_results select throws_ok(
  $$insert into public.products (business_id, name, price) values ('00000000-0000-0000-0000-0000000078a1', 'Too long', repeat('x', 61))$$,
  '23514', null, 'a display price over 60 characters is rejected'
);

insert into _tap_results select ok(
  pg_get_function_result('public.match_products(uuid, extensions.vector, int)'::regprocedure) like '%price text%',
  'match_products returns price as text'
);
insert into _tap_results select ok(
  pg_get_function_result('public.match_services(uuid, extensions.vector, int)'::regprocedure) like '%price text%',
  'match_services returns price as text'
);

insert into _tap_results select is(
  (select currency from public.businesses where id = '00000000-0000-0000-0000-0000000078a1'),
  'INR',
  'a new business defaults to INR'
);
insert into _tap_results select throws_ok(
  $$update public.businesses set currency = 'rupees' where id = '00000000-0000-0000-0000-0000000078a1'$$,
  '23514', null, 'currency must be a 3-letter ISO code'
);

insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
