begin;
select plan(7);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, anon;
insert into public.businesses (id, clerk_org_id, name)
values ('00000000-0000-0000-0000-0000000081a1', 'org_languages', 'Languages');

insert into _tap_results select lives_ok(format('update public.businesses set widget_language = %L where clerk_org_id = %L', language, 'org_languages'),
  'stores widget language ' || language)
from unnest(array['te', 'ta', 'kn', 'mr', 'bn', 'auto']) as language;

insert into _tap_results select throws_ok($$update public.businesses set widget_language = 'xyz' where clerk_org_id = 'org_languages'$$,
  '23514', null, 'rejects unsupported widget language');
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
