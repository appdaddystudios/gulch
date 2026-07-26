-- Aggregate anonymous save counts powering Home "Trending" ("X saves").
-- Devices are anonymous (no auth), so mutations go through a validated RPC.
-- A per-device ledger makes the RPC idempotent: replaying "save" for the same
-- (event, device) pair is a no-op, so counts cannot be inflated by repeat calls.

create table public.event_saves (
  event_id text not null references public.events(webflow_item_id) on delete cascade,
  device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, device_id)
);

alter table public.event_saves enable row level security;

-- No anon/authenticated policies: clients never read or write the ledger
-- directly — only through set_event_saved below.
create policy event_saves_all_service_role
  on public.event_saves for all to service_role using (true) with check (true);

-- Denormalized counter kept in lockstep with the ledger so event queries can
-- embed a cheap to-one relation instead of aggregating per request.
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

-- Single entry point for save-state changes. Idempotent per (event, device):
-- the counter only moves when the ledger row is actually inserted or deleted.
create or replace function public.set_event_saved(
  p_event_id text,
  p_device_id uuid,
  p_saved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if p_saved then
    insert into public.event_saves (event_id, device_id)
    values (p_event_id, p_device_id)
    on conflict do nothing;
    get diagnostics changed = row_count;
    if changed > 0 then
      insert into public.event_save_counts as c (event_id, saves)
      values (p_event_id, 1)
      on conflict (event_id) do update set saves = c.saves + 1;
    end if;
  else
    delete from public.event_saves
    where event_id = p_event_id and device_id = p_device_id;
    get diagnostics changed = row_count;
    if changed > 0 then
      update public.event_save_counts
      set saves = greatest(saves - 1, 0)
      where event_id = p_event_id;
    end if;
  end if;
end;
$$;

revoke all on function public.set_event_saved(text, uuid, boolean) from public;
grant execute on function public.set_event_saved(text, uuid, boolean) to anon, authenticated, service_role;
