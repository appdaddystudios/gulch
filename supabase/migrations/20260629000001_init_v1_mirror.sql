-- Gulch Supabase v1 mirror schema.
-- No extensions are required for v1; postgis and pg_cron are reserved for v-next.

create table public.locations (
  webflow_item_id text primary key,
  name text not null,
  slug text not null unique,
  name_address text,
  google_maps_url text,
  neighborhood text,
  parking text,
  hide_from_list boolean not null default false,
  latitude double precision,
  longitude double precision,
  geocode_status text not null default 'pending' check (geocode_status in ('pending', 'ok', 'failed', 'manual')),
  geocoded_at timestamptz,
  webflow_last_updated timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  webflow_item_id text primary key,
  name text not null,
  slug text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  custom_time_description text,
  location_id text references public.locations(webflow_item_id) on delete set null,
  external_link text not null,
  tickets_required boolean not null default false,
  webflow_last_updated timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shows (
  webflow_item_id text primary key,
  name text not null,
  slug text not null,
  start_date timestamptz,
  end_date timestamptz,
  location_id text references public.locations(webflow_item_id) on delete set null,
  external_link text,
  webflow_last_updated timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_location_id_idx on public.events(location_id);
create index events_start_at_idx on public.events(start_at);
create index shows_location_id_idx on public.shows(location_id);
create index locations_slug_idx on public.locations(slug);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger locations_set_updated_at
before update on public.locations
for each row
execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

create trigger shows_set_updated_at
before update on public.shows
for each row
execute function public.set_updated_at();

alter table public.locations enable row level security;
alter table public.events enable row level security;
alter table public.shows enable row level security;

create policy locations_select_anon on public.locations for select to anon using (true);
create policy locations_select_authenticated on public.locations for select to authenticated using (true);
create policy locations_all_service_role on public.locations for all to service_role using (true) with check (true);

create policy events_select_anon on public.events for select to anon using (true);
create policy events_select_authenticated on public.events for select to authenticated using (true);
create policy events_all_service_role on public.events for all to service_role using (true) with check (true);

create policy shows_select_anon on public.shows for select to anon using (true);
create policy shows_select_authenticated on public.shows for select to authenticated using (true);
create policy shows_all_service_role on public.shows for all to service_role using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;

grant select on public.locations to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.shows to anon, authenticated;

grant all on public.locations to service_role;
grant all on public.events to service_role;
grant all on public.shows to service_role;
