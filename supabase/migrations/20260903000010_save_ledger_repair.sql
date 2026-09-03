-- Repair: 0008 reached production in its first form (increment_event_save,
-- no per-device ledger) before it was rewritten locally, and the migration
-- history already recorded 0008 as applied — so the rewrite never ran.
-- Bring the remote up to the ledger design idempotently. Safe against both a
-- v1 remote and a database where the rewritten 0008 did run.

create table if not exists public.event_saves (
  event_id text not null references public.events(webflow_item_id) on delete cascade,
  device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, device_id)
);

alter table public.event_saves enable row level security;

-- No anon/authenticated policies: clients never read or write the ledger
-- directly — only through set_event_saved below.
drop policy if exists event_saves_all_service_role on public.event_saves;
create policy event_saves_all_service_role
  on public.event_saves for all to service_role using (true) with check (true);

-- event_save_counts and its select policies exist identically in both
-- histories; nothing to change there.

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

-- The v1 counter RPC was unguarded (any client could add any delta) and has
-- no callers in the app or admin.
drop function if exists public.increment_event_save(text, integer);
