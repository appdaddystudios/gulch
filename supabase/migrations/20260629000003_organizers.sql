-- 1. organizers (mirrors locations table conventions)
create table public.organizers (
  webflow_item_id text primary key,
  name text not null,
  slug text not null unique,
  website_url text,
  instagram_url text,
  facebook_url text,
  is_featured boolean not null default false,
  custom_color text,                         -- hex "#rrggbb" from Webflow Color
  webflow_last_updated timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. locations additive columns (non-destructive)
alter table public.locations
  add column is_organizer boolean not null default false,
  add column managing_organizer_id text
    references public.organizers(webflow_item_id) on delete set null;

-- 3. event_organizers junction (M:N, derived from events.additional-organizers)
create table public.event_organizers (
  event_id text not null references public.events(webflow_item_id) on delete cascade,
  organizer_id text not null references public.organizers(webflow_item_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, organizer_id)
);

-- 4. indexes
create index organizers_is_featured_idx on public.organizers(is_featured) where is_featured = true;
create index locations_managing_organizer_idx on public.locations(managing_organizer_id);
create index event_organizers_organizer_idx on public.event_organizers(organizer_id);

-- 5. updated_at trigger (reuse public.set_updated_at)
create trigger organizers_set_updated_at
  before update on public.organizers
  for each row execute function public.set_updated_at();

-- 6. RLS + grants (mirror existing pattern)
alter table public.organizers enable row level security;
alter table public.event_organizers enable row level security;

create policy organizers_select_anon on public.organizers for select to anon using (true);
create policy organizers_select_authenticated on public.organizers for select to authenticated using (true);
create policy organizers_all_service_role on public.organizers for all to service_role using (true) with check (true);

create policy event_organizers_select_anon on public.event_organizers for select to anon using (true);
create policy event_organizers_select_authenticated on public.event_organizers for select to authenticated using (true);
create policy event_organizers_all_service_role on public.event_organizers for all to service_role using (true) with check (true);

grant select on public.organizers, public.event_organizers to anon, authenticated;
grant all on public.organizers, public.event_organizers to service_role;
