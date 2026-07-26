-- events: sponsored flag (additive, non-destructive).
-- Set from the admin dashboard; renders the "Sponsored" badge on event cards.
alter table public.events
  add column sponsored boolean not null default false;

create index events_sponsored_idx on public.events(sponsored)
  where sponsored = true;
