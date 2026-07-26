-- Aggregate anonymous save counts powering Home "Trending" ("X saves").
-- Devices are anonymous (no auth), so writes go through a validated RPC
-- rather than direct table access.

create table public.event_save_counts (
  event_id text primary key references public.events(webflow_item_id) on delete cascade,
  saves integer not null default 0 check (saves >= 0)
);

alter table public.event_save_counts enable row level security;

create policy event_save_counts_select_anon
  on public.event_save_counts for select to anon using (true);
create policy event_save_counts_select_authenticated
  on public.event_save_counts for select to authenticated using (true);
create policy event_save_counts_all_service_role
  on public.event_save_counts for all to service_role using (true) with check (true);

-- Single entry point for count changes: delta is constrained to +/-1 and the
-- counter floors at zero, so replayed or unbalanced calls cannot corrupt it.
create or replace function public.increment_event_save(p_event_id text, p_delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_delta not in (1, -1) then
    raise exception 'delta must be 1 or -1';
  end if;

  insert into public.event_save_counts as c (event_id, saves)
  values (p_event_id, greatest(p_delta, 0))
  on conflict (event_id)
  do update set saves = greatest(c.saves + p_delta, 0);
end;
$$;

revoke all on function public.increment_event_save(text, integer) from public;
grant execute on function public.increment_event_save(text, integer) to anon, authenticated, service_role;
