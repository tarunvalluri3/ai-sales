begin;
select plan(6);
create temporary table _tap_results (line text);
grant insert on _tap_results to authenticated, anon;
insert into public.businesses (id, clerk_org_id, name) values
  ('00000000-0000-0000-0000-0000000080a1', 'org_persona_a', 'Persona A'),
  ('00000000-0000-0000-0000-0000000080b1', 'org_persona_b', 'Persona B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"owner_a","role":"authenticated","o":{"id":"org_persona_a"}}', true);
select * from public.publish_agent('00000000-0000-0000-0000-0000000080a1');
insert into _tap_results select is(public.build_agent_snapshot('00000000-0000-0000-0000-0000000080a1') #>> '{config,persona,agentName}',
  null::text, 'unset name is omitted');
insert into _tap_results select is((select draft_snapshot from public.agent_publish_status('00000000-0000-0000-0000-0000000080a1')),
  null::jsonb, 'missing persona values preserve the live fingerprint');
update public.businesses set agent_name = 'Maya', agent_avatar_url = 'https://example.invalid/maya.png' where clerk_org_id = 'org_persona_a';
insert into _tap_results select is((select draft_snapshot #>> '{config,persona,agentName}' from public.agent_publish_status('00000000-0000-0000-0000-0000000080a1')),
  'Maya', 'name changes the draft fingerprint');
insert into _tap_results select is((select live_snapshot #>> '{config,persona,agentAvatarUrl}' from public.agent_publish_status('00000000-0000-0000-0000-0000000080a1')),
  null::text, 'avatar stays unpublished until publish');
select * from public.publish_agent('00000000-0000-0000-0000-0000000080a1');
insert into _tap_results select is((select draft_snapshot from public.agent_publish_status('00000000-0000-0000-0000-0000000080a1')),
  null::jsonb, 'publishing clears the unpublished diff');
insert into _tap_results select is(public.build_agent_snapshot('00000000-0000-0000-0000-0000000080b1'),
  null::jsonb, 'another tenant cannot build the snapshot');
reset role;
insert into _tap_results select * from finish();
select line from _tap_results;
rollback;
