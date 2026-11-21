begin;
alter table public.businesses add column if not exists agent_name text,
  add column if not exists agent_avatar_url text;
alter table public.businesses drop constraint if exists businesses_agent_name_check;
alter table public.businesses add constraint businesses_agent_name_check
  check (agent_name is null or (char_length(agent_name) between 1 and 40 and agent_name = btrim(agent_name) and agent_name !~ '[[:cntrl:]]'));
grant update (agent_name, agent_avatar_url) on public.businesses to authenticated;

create or replace function public.build_agent_snapshot(p_business_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'schema', 1,
    'config', jsonb_build_object(
      'name', b.name,
      'description', b.description,
      'contactEmail', b.contact_email,
      'contactPhone', b.contact_phone,
      'website', b.website,
      'language', b.widget_language,
      'persona', jsonb_build_object(
        'welcomeText', b.widget_welcome_text,
        'welcomeTextClosed', b.widget_welcome_text_closed,
        'ctaText', b.widget_cta_text,
        'suggestedQuestions', coalesce(b.widget_suggested_questions, '[]'::jsonb)
      ) || jsonb_strip_nulls(jsonb_build_object('agentName', b.agent_name, 'agentAvatarUrl', b.agent_avatar_url)),
      'channels', jsonb_build_object(
        'accentColor', b.widget_accent_color,
        'logoUrl', b.widget_logo_url,
        'position', b.widget_position,
        'privacyPolicyUrl', b.privacy_policy_url
      ),
      -- Which tools the AI is given. The appointment slot length, business
      -- hours and timezone are operational scheduling settings that govern
      -- real bookings, not agent content, so they are NOT versioned: they
      -- apply immediately (lib/appointments.ts reads them from businesses).
      'capabilities', jsonb_build_object(
        'recommendProducts', b.recommend_products_enabled,
        'appointments', b.appointments_enabled
      )
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'description', p.description, 'price', p.price,
        'priceAmount', p.price_amount, 'category', p.category, 'imageUrl', p.image_url,
        'createdAt', p.created_at
      ) order by p.created_at, p.id)
      from public.products p
      where p.business_id = b.id and p.status = 'approved'
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'price', s.price,
        'priceAmount', s.price_amount, 'category', s.category, 'imageUrl', s.image_url,
        'createdAt', s.created_at
      ) order by s.created_at, s.id)
      from public.services s
      where s.business_id = b.id and s.status = 'approved'
    ), '[]'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'question', f.question, 'answer', f.answer, 'createdAt', f.created_at
      ) order by f.created_at, f.id)
      from public.faqs f
      where f.business_id = b.id and f.status = 'approved'
    ), '[]'::jsonb),
    -- References, not content: the chunks themselves are copied at publish.
    -- The hash covers title + content so an edit to a published document
    -- counts as a change.
    'knowledge', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'sourceType', d.source_type,
        'contentHash', md5(d.title || chr(10) || d.content)
      ) order by d.created_at, d.id)
      from public.knowledge_documents d
      where d.business_id = b.id
        and d.source_type in ('manual', 'file', 'url')
        and d.status = 'published'
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.id = p_business_id;
$$;

commit;
