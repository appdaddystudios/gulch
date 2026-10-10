-- Event liveness: the app must show exactly what a site visitor sees.
-- Webflow "published" = is_live. Unpublished / removed items keep their row
-- (a re-publish restores them cleanly) but are hidden from every app read via
-- RLS, so no client query can forget the filter. service_role is unaffected.

alter table public.events
  add column is_live boolean not null default true;

-- App reads filter by start_at; keep the planner cheap for the live subset.
create index events_live_start_at_idx
  on public.events (start_at)
  where is_live;

drop policy events_select_anon on public.events;
drop policy events_select_authenticated on public.events;

create policy events_select_anon
  on public.events for select to anon using (is_live);
create policy events_select_authenticated
  on public.events for select to authenticated using (is_live);

-- One row per reconcile run (cron, site_publish webhook, manual backfill).
-- Source of truth for "did the last sync succeed" — pg_net's 5 s timeout
-- cannot observe the Edge Function's outcome — and the debounce clock for
-- site_publish-triggered runs.
create table public.sync_runs (
  id bigint generated always as identity primary key,
  source text not null check (source in ('cron', 'site_publish', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb,
  error text
);

alter table public.sync_runs enable row level security;

-- Service role only: written by Edge Functions, read by operators.
create policy sync_runs_all_service_role
  on public.sync_runs for all to service_role using (true) with check (true);

create index sync_runs_started_at_idx
  on public.sync_runs (started_at desc);
