begin;
select plan(7);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated;

insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-0000000079a1', 'org_hours_confirm_a', 'Hours A'),
       ('00000000-0000-0000-0000-0000000079b1', 'org_hours_confirm_b', 'Hours B');
insert into public.business_hours (business_id, day_of_week, is_open, start_time, end_time)
values ('00000000-0000-0000-0000-0000000079a1', 1, true, '09:00', '18:00'),
       ('00000000-0000-0000-0000-0000000079b1', 1, true, '09:00', '18:00');

insert into _tap_results select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.business_hours'::regclass),
  'business_hours still enables and forces RLS'
);
insert into _tap_results select policies_are('public', 'business_hours', array[
  'business_hours_delete_own_business', 'business_hours_insert_own_business',
  'business_hours_select_own_business', 'business_hours_update_own_business'
]);
insert into _tap_results select is(
  (select count(*) from public.business_hours where business_id in (
    '00000000-0000-0000-0000-0000000079a1', '00000000-0000-0000-0000-0000000079b1'
  ) and confirmed_at is not null), 0::bigint, 'new hours start unconfirmed'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'owner_hours_a', 'role', 'authenticated', 'o', json_build_object('id', 'org_hours_confirm_a'))::text,
  true
);
insert into _tap_results select is(
  (select count(*) from public.business_hours where business_id = '00000000-0000-0000-0000-0000000079b1'),
  0::bigint, 'A cannot read B hours'
);
insert into _tap_results select throws_ok(
  $$insert into public.business_hours (business_id, day_of_week, is_open, start_time, end_time, confirmed_at)
    values ('00000000-0000-0000-0000-0000000079b1', 1, true, '09:00', '18:00', now())
    on conflict (business_id, day_of_week) do update set confirmed_at = excluded.confirmed_at$$,
  '42501', null, 'A cannot confirm B hours using the application upsert'
);
insert into _tap_results select lives_ok(
  $$insert into public.business_hours (business_id, day_of_week, is_open, start_time, end_time, confirmed_at)
    values ('00000000-0000-0000-0000-0000000079a1', 1, true, '09:00', '18:00', now())
    on conflict (business_id, day_of_week) do update set confirmed_at = excluded.confirmed_at$$,
  'A can confirm its own hours using the application upsert'
);
reset role;

insert into _tap_results select ok(
  (select confirmed_at is not null from public.business_hours where business_id = '00000000-0000-0000-0000-0000000079a1')
  and (select confirmed_at is null from public.business_hours where business_id = '00000000-0000-0000-0000-0000000079b1'),
  'only A hours were confirmed'
);
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
