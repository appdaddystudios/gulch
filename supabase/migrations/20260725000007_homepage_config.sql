-- Admin dashboard first pass: homepage config + admin-owned featured curation.
-- Both tables are publicly readable and writable ONLY via the service role
-- (no anon write policies) — the admin Next.js server is the sole writer.

-- Single-row app homepage configuration.
create table public.homepage_config (
  id smallint primary key default 1 check (id = 1),
  research_label text not null default 'Take the Survey',
  research_url text not null default 'https://www.gulchmagazine.com/research',
  banner_enabled boolean not null default false,
  banner_title text,
  banner_body text,
  banner_image_url text,
  banner_link_url text,
  updated_at timestamptz not null default now()
);

insert into public.homepage_config (id) values (1);

alter table public.homepage_config enable row level security;

create policy homepage_config_public_read on public.homepage_config
  for select to anon, authenticated using (true);

-- Admin-curated homepage Featured Organizations. Replaces the Webflow-synced
-- organizers.is_featured flag as the app's source (the sync would clobber
-- direct edits to that flag); seeded from it once below.
create table public.featured_organizers (
  organizer_id text primary key
    references public.organizers(webflow_item_id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.featured_organizers (organizer_id, position)
select webflow_item_id, row_number() over (order by name) - 1
from public.organizers
where is_featured = true;

alter table public.featured_organizers enable row level security;

create policy featured_organizers_public_read on public.featured_organizers
  for select to anon, authenticated using (true);

-- Public bucket for uploaded banner-ad images (same pattern as event-images).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name='storage') then
    insert into storage.buckets (id, name, public) values ('banner-ads','banner-ads', true) on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='banner_ads_public_read') then
      execute 'create policy banner_ads_public_read on storage.objects for select to anon, authenticated using (bucket_id = ''banner-ads'')';
    end if;
  end if;
end $$;
